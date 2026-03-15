using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Text;
using Ruleta.Api.Data;
using Ruleta.Api.Dtos;
using Ruleta.Api.Endpoints;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()
    ?? new[]
    {
        "http://localhost:5173",
        "http://localhost:8080",
        "https://eventprolabs-ruleta-mvp.3haody.easypanel.host"
    };

builder.Services.AddCors(opt =>
{
    opt.AddPolicy("FrontPolicy", p => p.WithOrigins(allowedOrigins)
                                       .AllowAnyHeader()
                                       .AllowAnyMethod());
});

// EF Core + MySQL (cadena viene de ConnectionStrings:Default)
var cs = builder.Configuration.GetConnectionString("Default")
         ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
         ?? "Server=localhost;Port=3306;Database=ruleta_dev;User=root;Password=devpass;TreatTinyAsBoolean=true";

builder.Services.AddDbContext<AppDbContext>(opt =>
{
    var sv = ServerVersion.AutoDetect(cs);
    opt.UseMySql(cs, sv);
});

var app = builder.Build();

// -------- Rate limit básico (memoria) --------
var rlWindow = TimeSpan.FromMinutes(1);
const int RL_MAX_REQ = 30;
var rlStore = new ConcurrentDictionary<string, List<DateTime>>();

app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value?.ToLowerInvariant() ?? "";
    if (!path.StartsWith("/api/spin") && !path.StartsWith("/api/register"))
    {
        await next();
        return;
    }

    var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var key = $"{ip}:{path}";
    var now = DateTime.UtcNow;

    var list = rlStore.GetOrAdd(key, _ => new List<DateTime>(RL_MAX_REQ + 5));

    bool reject;
    lock (list)
    {
        // Desliza ventana
        list.RemoveAll(t => now - t > rlWindow);

        if (list.Count >= RL_MAX_REQ)
        {
            reject = true;
        }
        else
        {
            list.Add(now);
            reject = false;
        }
    }

    if (reject)
    {
        ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        ctx.Response.Headers["Retry-After"] = "60";
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync("{\"error\":\"Demasiadas solicitudes, intenta en un minuto.\"}");
        return;
    }

    await next();
});

app.UseCors("FrontPolicy");

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/ping", () => Results.Ok(new { pong = true, at = DateTimeOffset.UtcNow }));

// ==== Apply Migrations + Seed (dev) ====
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    if (!db.Eventos.Any())
    {
        var ev = new Evento { Nombre = "Torito Pacífico - MVP", Activo = true };
        db.Eventos.Add(ev);
        db.SaveChanges();

        db.Premios.AddRange(
            new Premio { EventoId = ev.Id, Nombre = "Gorra Pacífico", Peso = 25, Stock = 10, SegmentoPerdedor = false, Activo = true },
            new Premio { EventoId = ev.Id, Nombre = "Stickers Pack", Peso = 15, Stock = 50, SegmentoPerdedor = false, Activo = true },
            new Premio { EventoId = ev.Id, Nombre = "Sigue intentando", Peso = 60, Stock = 0, SegmentoPerdedor = true, Activo = true }
        );
        db.SaveChanges();
    }
}


// ===== Endpoints MVP =====

// Registro único por evento (email o teléfono)
app.MapPost("/api/register", async (RegisterDto dto, AppDbContext db) =>
{
    // normaliza
    var email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim().ToLowerInvariant();
    var tel = string.IsNullOrWhiteSpace(dto.Telefono) ? null : dto.Telefono.Trim();

    // Si ya existe por email o tel en el mismo evento, devuelve el mismo usuario
    var existing = await db.Usuarios
        .FirstOrDefaultAsync(u => u.EventoId == dto.EventId
                               && ((email != null && u.Email == email) || (tel != null && u.Telefono == tel)));

    if (existing is not null)
        return Results.Ok(new { usuarioId = existing.Id, yaRegistrado = true });

    var user = new Usuario
    {
        EventoId = dto.EventId,
        Nombre = dto.Nombre.Trim(),
        Email = email,
        Telefono = tel,
        AceptoTerminos = dto.AceptoTerminos
    };
    db.Usuarios.Add(user);
    await db.SaveChangesAsync();

    return Results.Ok(new { usuarioId = user.Id, yaRegistrado = false });
});

// Giro con transacción y control de stock
app.MapPost("/api/spin", async (SpinDto dto, AppDbContext db) =>
{
    // Validaciones previas
    var userExists = await db.Usuarios.AnyAsync(u => u.Id == dto.UsuarioId && u.EventoId == dto.EventId);
    if (!userExists)
        return Results.BadRequest(new { error = "Usuario no registrado para este evento." });

    var eventActive = await db.Eventos.AnyAsync(e => e.Id == dto.EventId && e.Activo);
    if (!eventActive)
        return Results.BadRequest(new { error = "Evento no disponible." });

    // ¿ya jugó este usuario en este evento?
    var yaJugo = await db.Jugadas.AnyAsync(j => j.EventoId == dto.EventId && j.UsuarioId == dto.UsuarioId);
    if (yaJugo)
        return Results.BadRequest(new { error = "El usuario ya realizó su giro en este evento." });

    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
    try
    {
        // Bloquea filas de premios del evento para evitar condiciones de carrera
        var premios = await db.Premios
            .FromSqlRaw("SELECT * FROM `Premios` WHERE `EventoId` = {0} AND `Activo` = 1 FOR UPDATE", dto.EventId)
            .ToListAsync();

        // Bolsa: segmentos perdedores (+) premios con stock>0 y peso>0
        var bolsa = premios
            .Where(p => p.Peso > 0 && (p.SegmentoPerdedor || p.Stock > 0))
            .ToList();

        if (bolsa.Count == 0)
        {
            var jugadaNada = new Jugada
            {
                EventoId = dto.EventId,
                UsuarioId = dto.UsuarioId,
                Resultado = "LOSE",
                PremioId = null
            };
            db.Jugadas.Add(jugadaNada);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { resultado = "LOSE" }); // 👈 sin jugadaId
        }

        // Random ponderado
        var totalPeso = bolsa.Sum(p => (long)p.Peso);
        var pick = Random.Shared.NextInt64(1, totalPeso + 1);
        long acc = 0;
        var seleccionado = bolsa[0];

        foreach (var p in bolsa)
        {
            acc += p.Peso;
            if (pick <= acc) { seleccionado = p; break; }
        }

        // Aplica resultado
        if (!seleccionado.SegmentoPerdedor)
        {
            // Premio con stock
            if (seleccionado.Stock <= 0)
            {
                // Por si se agotó entre lectura y asignación, registra LOSE igualmente
                var jugadaLose = new Jugada
                {
                    EventoId = dto.EventId,
                    UsuarioId = dto.UsuarioId,
                    Resultado = "LOSE",
                    PremioId = null
                };
                db.Jugadas.Add(jugadaLose);
                await db.SaveChangesAsync();
                await tx.CommitAsync();
                return Results.Ok(new { resultado = "LOSE" }); // 👈 sin jugadaId
            }

            seleccionado.Stock -= 1;
            db.Premios.Update(seleccionado);

            var jugadaWin = new Jugada
            {
                EventoId = dto.EventId,
                UsuarioId = dto.UsuarioId,
                PremioId = seleccionado.Id,
                Resultado = $"WIN {seleccionado.Nombre}"
            };
            db.Jugadas.Add(jugadaWin);

            await db.SaveChangesAsync();
            await tx.CommitAsync();

            return Results.Ok(new
            {
                resultado = "WIN",
                premio = seleccionado.Nombre,
                premioId = seleccionado.Id,
                jugadaId = jugadaWin.Id
            });
        }
        else
        {
            // Segmento perdedor
            var jugadaLose = new Jugada
            {
                EventoId = dto.EventId,
                UsuarioId = dto.UsuarioId,
                Resultado = "LOSE",
                PremioId = null
            };
            db.Jugadas.Add(jugadaLose);
            await db.SaveChangesAsync();
            await tx.CommitAsync();

            return Results.Ok(new { resultado = "LOSE" }); // 👈 sin jugadaId
        }
    }
    catch
    {
        await tx.RollbackAsync();
        // En prod: loggear excepción
        return Results.Problem("Error al procesar el giro.");
    }
});


// ======================= DEBUG / ADMIN (SOLO DEV) =======================
// Autorización simple por header: x-admin-key: <Admin:DebugKey>
app.MapGet("/api/admin/debug/health", async (AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var evs = await db.Eventos.CountAsync();
    var users = await db.Usuarios.CountAsync();
    var prizes = await db.Premios.CountAsync();
    var spins = await db.Jugadas.CountAsync();

    return Results.Ok(new { eventos = evs, usuarios = users, premios = prizes, jugadas = spins });
});

// Lista de eventos
app.MapGet("/api/admin/debug/events", async (AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var data = await db.Eventos
        .OrderByDescending(e => e.CreadoEn)
        .Select(e => new { e.Id, e.Nombre, e.Activo, e.CreadoEn })
        .ToListAsync();

    return Results.Ok(data);
});

// Premios por evento (con totales básicos)
app.MapGet("/api/admin/debug/prizes", async (int eventId, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var data = await db.Premios
        .Where(p => p.EventoId == eventId && p.Activo)
        .Select(p => new
        {
            p.Id,
            p.EventoId,
            p.Nombre,
            p.Peso,
            p.Stock,
            p.SegmentoPerdedor,
            p.CreadoEn
        })
        .OrderBy(p => p.Id)
        .ToListAsync();

    return Results.Ok(data);
});

// Usuarios por evento (paginado simple)
app.MapGet("/api/admin/debug/users", async (int eventId, int top, int skip, string? search, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    top = top <= 0 ? 50 : Math.Min(top, 200);
    skip = Math.Max(skip, 0);
    search = search?.Trim();

    var q = db.Usuarios.Where(u => u.EventoId == eventId);

    if (!string.IsNullOrWhiteSpace(search))
        q = q.Where(u => u.Nombre.Contains(search) || (u.Email != null && u.Email.Contains(search)) || (u.Telefono != null && u.Telefono.Contains(search)));

    var list = await q
        .OrderByDescending(u => u.CreadoEn)
        .Skip(skip).Take(top)
        .Select(u => new { u.Id, u.EventoId, u.Nombre, u.Email, u.Telefono, u.CreadoEn })
        .ToListAsync();

    return Results.Ok(list);
});

// Jugadas por evento (paginado simple)
app.MapGet("/api/admin/debug/spins", async (int eventId, int top, int skip, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    top = top <= 0 ? 50 : Math.Min(top, 500);
    skip = Math.Max(skip, 0);

    var data = await (from j in db.Jugadas
                      join u in db.Usuarios on j.UsuarioId equals u.Id
                      join p in db.Premios on j.PremioId equals p.Id into pj
                      from p in pj.DefaultIfEmpty()
                      where j.EventoId == eventId
                      orderby j.CreadoEn descending
                      select new
                      {
                          j.Id,
                          j.EventoId,
                          UsuarioId = j.UsuarioId,
                          Usuario = u.Nombre,
                          u.Email,
                          u.Telefono,
                          j.Resultado,
                          Premio = p != null ? p.Nombre : null,
                          j.Entregado,
                          j.EntregadoEn,
                          j.CreadoEn
                      })
        .Skip(skip).Take(top)
        .ToListAsync();

    return Results.Ok(data);
});

// Cambiar stock (query-string: ?set=20 ó ?delta=5)
app.MapPost("/api/admin/debug/prizes/{id:int}/stock", async (int id, int? set, int? delta, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var p = await db.Premios.FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();

    if (set.HasValue) p.Stock = Math.Max(0, set.Value);
    if (delta.HasValue) p.Stock = Math.Max(0, p.Stock + delta.Value);

    db.Premios.Update(p);
    await db.SaveChangesAsync();

    return Results.Ok(new { p.Id, p.Nombre, p.Stock });
});

// Marcar entregado (query-string: ?jugadaId=123&entregado=true)
app.MapPost("/api/admin/debug/fulfill", async (long jugadaId, bool entregado, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var j = await db.Jugadas.FirstOrDefaultAsync(x => x.Id == jugadaId);
    if (j is null) return Results.NotFound();

    j.Entregado = entregado;
    j.EntregadoEn = entregado ? DateTimeOffset.UtcNow : null;

    await db.SaveChangesAsync();
    return Results.Ok(new { j.Id, j.Entregado, j.EntregadoEn });
});

// Export CSV de jugadas por evento
app.MapGet("/api/admin/debug/export", async (int eventId, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var rows = await (from j in db.Jugadas
                      join u in db.Usuarios on j.UsuarioId equals u.Id
                      join p in db.Premios on j.PremioId equals p.Id into pj
                      from p in pj.DefaultIfEmpty()
                      where j.EventoId == eventId
                      orderby j.CreadoEn descending
                      select new
                      {
                          j.Id,
                          j.EventoId,
                          j.UsuarioId,
                          Usuario = u.Nombre,
                          u.Email,
                          u.Telefono,
                          j.Resultado,
                          Premio = p != null ? p.Nombre : "",
                          j.Entregado,
                          j.EntregadoEn,
                          j.CreadoEn
                      }).ToListAsync();

    var sb = new StringBuilder();
    sb.AppendLine("JugadaId,EventoId,UsuarioId,Usuario,Email,Telefono,Resultado,Premio,Entregado,EntregadoEn,CreadoEn");
    foreach (var r in rows)
    {
        string esc(string? s) => string.IsNullOrEmpty(s) ? "" : "\"" + s.Replace("\"", "\"\"") + "\"";
        sb.AppendLine(string.Join(",",
            r.Id,
            r.EventoId,
            r.UsuarioId,
            esc(r.Usuario),
            esc(r.Email),
            esc(r.Telefono),
            esc(r.Resultado),
            esc(r.Premio),
            r.Entregado ? "1" : "0",
            r.EntregadoEn?.ToString("yyyy-MM-dd HH:mm:ss") ?? "",
            r.CreadoEn.ToString("yyyy-MM-dd HH:mm:ss")
        ));
    }

    return Results.Text(sb.ToString(), "text/csv", Encoding.UTF8);
});
// ===================== FIN DEBUG / ADMIN DEV ============================

// ===== Endpoint público de premios (no expone stock) =====
app.MapGet("/api/prizes", async (int eventId, AppDbContext db) =>
{
    var data = await db.Premios
        .Where(p => p.EventoId == eventId && p.Activo)
        .Select(p => new {
            id = p.Id,
            nombre = p.Nombre,
            peso = p.Peso,                 // peso relativo (para dibujar segmentos)
            esPerdedor = p.SegmentoPerdedor
        })
        .OrderBy(p => p.id)
        .ToListAsync();

    // fallback: si no hay pesos válidos, asigna 1 a todos para que se dibujen
    if (data.Count > 0 && data.All(d => d.peso <= 0))
    {
        data = data.Select(d => new { d.id, d.nombre, peso = 1, d.esPerdedor }).ToList();
    }

    return Results.Ok(data);
});

app.MapGet("/api/admin/debug/verify", async (long jugadaId, AppDbContext db, HttpRequest req, IConfiguration cfg) =>
{
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    var j = await db.Jugadas.FindAsync(jugadaId);
    if (j is null) return Results.NotFound();

    var premio = j.PremioId.HasValue ? await db.Premios.FindAsync(j.PremioId.Value) : null;

    return Results.Ok(new
    {
        j.Id,
        j.EventoId,
        j.UsuarioId,
        j.Resultado,
        Premio = premio?.Nombre,
        j.Entregado,
        j.EntregadoEn,
        j.CreadoEn
    });
});

app.MapGet("/api/admin/debug/export", async (HttpRequest req, AppDbContext db, IConfiguration cfg) =>
{
    // auth simple por header (mismo Admin:DebugKey)
    var ok = req.Headers.TryGetValue("x-admin-key", out var key) && key == cfg["Admin:DebugKey"];
    if (!ok) return Results.Unauthorized();

    // JOINs básicos
    var rows = await db.Jugadas
        .OrderBy(j => j.CreadoEn)
        .Select(j => new
        {
            j.Id,
            j.EventoId,
            j.UsuarioId,
            j.Resultado,
            PremioNombre = j.PremioId != null ? db.Premios.Where(p => p.Id == j.PremioId).Select(p => p.Nombre).FirstOrDefault() : null,
            j.Entregado,
            j.EntregadoEn,
            j.CreadoEn
        })
        .ToListAsync();

    var sb = new StringBuilder();
    sb.AppendLine("JugadaId,EventoId,UsuarioId,Resultado,Premio,Entregado,EntregadoEn,CreadoEn");

    foreach (var r in rows)
    {
        string csvLine = string.Join(",",
            r.Id,
            r.EventoId,
            r.UsuarioId,
            Csv(r.Resultado),
            Csv(r.PremioNombre ?? ""),
            r.Entregado ? "SI" : "NO",
            r.EntregadoEn?.ToString("yyyy-MM-dd HH:mm:ss") ?? "",
            r.CreadoEn.ToString("yyyy-MM-dd HH:mm:ss")
        );
        sb.AppendLine(csvLine);
    }

    var bytes = Encoding.UTF8.GetBytes(sb.ToString());
    return Results.File(
        bytes,
        contentType: "text/csv; charset=utf-8",
        fileDownloadName: $"jugadas_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv"
    );

    // Local helper
    static string Csv(string s)
    {
        if (s.Contains('"') || s.Contains(',') || s.Contains('\n') || s.Contains('\r'))
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        return s;
    }
});

app.MapGet("/api/brand", (int eventId) =>
{
    // TODO: leer de BD por EventoId; por ahora, devuelve el default.json embebido
    var brand = new
    {
        name = "pacifico-default",
        logo = "/brand/logo.svg",
        colors = new
        {
            bg = "#0a2540",
            card = "#0f2b4a",
            text = "#e6f1ff",
            primary = "#00a3e0",
            accent = "#66d9ff",
            border = "#1b3b63"
        },
        wheel = new[] { "#00a3e0", "#007ab8", "#66d9ff", "#00c2ff", "#1b3b63", "#005f99" },
        font = new { family = "Inter", href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" }
    };
    return Results.Ok(brand);
});

app.MapAdmin();  // 👈 registra /api/admin/...

var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Routes");
var endpoints = app.Services.GetRequiredService<EndpointDataSource>().Endpoints;
foreach (var e in endpoints.OfType<RouteEndpoint>())
{
    logger.LogInformation("Route mapped: {route}", e.RoutePattern.RawText);
}

app.Run();
