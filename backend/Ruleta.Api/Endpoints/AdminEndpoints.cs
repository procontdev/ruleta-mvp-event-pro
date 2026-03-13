using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Ruleta.Api.Data;
using Ruleta.Api.Dtos;   // tus DTOs
// using Ruleta.Api.Data; // si tu AppDbContext está en otro namespace, ajusta este using

namespace Ruleta.Api.Endpoints
{
    public static class AdminEndpoints
    {
        private static bool IsAdmin(HttpRequest req, IConfiguration cfg)
        => req.Headers.TryGetValue("x-admin-key", out var k) && k == cfg["Admin:DebugKey"];

        public static IEndpointRouteBuilder MapAdmin(this IEndpointRouteBuilder app)
        {
            // ============== EVENTOS ==============
            app.MapGet("/api/admin/events", async (HttpRequest req, AppDbContext db, IConfiguration cfg) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var eventos = await db.Eventos.AsNoTracking().OrderBy(e => e.Id).ToListAsync();
                var ids = eventos.Select(e => e.Id).ToList();
                if (ids.Count == 0) return Results.Ok(Array.Empty<object>());

                var premiosCount = await db.Premios
                    .Where(p => ids.Contains(p.EventoId))
                    .GroupBy(p => p.EventoId)
                    .Select(g => new { EventoId = g.Key, Cant = g.Count() })
                    .ToListAsync();

                var stockSum = await db.Premios
                    .Where(p => ids.Contains(p.EventoId) && !p.SegmentoPerdedor)
                    .GroupBy(p => p.EventoId)
                    .Select(g => new { EventoId = g.Key, Stock = g.Sum(p => p.Stock) })
                    .ToListAsync();

                var resp = eventos.Select(e => new
                {
                    id = e.Id,
                    nombre = e.Nombre,
                    premios = premiosCount.FirstOrDefault(x => x.EventoId == e.Id)?.Cant ?? 0,
                    stockTotal = stockSum.FirstOrDefault(x => x.EventoId == e.Id)?.Stock ?? 0
                });

                return Results.Ok(resp);
            });

            app.MapPost("/api/admin/events", async (HttpRequest req, AppDbContext db, IConfiguration cfg, AdminEventCreateDto dto) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();
                if (string.IsNullOrWhiteSpace(dto.Nombre)) return Results.BadRequest(new { error = "Nombre requerido" });

                var e = new Evento { Nombre = dto.Nombre.Trim() };
                db.Eventos.Add(e);
                await db.SaveChangesAsync();
                return Results.Ok(new { e.Id, e.Nombre });
            });

            app.MapPut("/api/admin/events/{id:int}", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int id, AdminEventUpdateDto dto) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var e = await db.Eventos.FindAsync(id);
                if (e is null) return Results.NotFound();

                if (!string.IsNullOrWhiteSpace(dto.Nombre)) e.Nombre = dto.Nombre.Trim();

                await db.SaveChangesAsync();
                return Results.Ok(new { e.Id, e.Nombre });
            });

            app.MapDelete("/api/admin/events/{id:int}", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int id) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var hasDeps = await db.Premios.AnyAsync(p => p.EventoId == id) || await db.Usuarios.AnyAsync(u => u.EventoId == id);
                if (hasDeps) return Results.BadRequest(new { error = "No se puede borrar: tiene premios o usuarios." });

                var e = await db.Eventos.FindAsync(id);
                if (e is null) return Results.NotFound();

                db.Eventos.Remove(e);
                await db.SaveChangesAsync();
                return Results.Ok(new { ok = true });
            });

            // ============== PREMIOS ==============
            app.MapGet("/api/admin/events/{eventId:int}/prizes", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int eventId) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var premios = await db.Premios
                    .Where(p => p.EventoId == eventId)
                    .OrderByDescending(p => !p.SegmentoPerdedor).ThenBy(p => p.Id)
                    .Select(p => new
                    {
                        p.Id,
                        p.EventoId,
                        p.Nombre,
                        p.Peso,
                        p.Stock,
                        EsPerdedor = p.SegmentoPerdedor,
                        p.Activo
                    })
                    .ToListAsync();

                return Results.Ok(premios);
            });

            app.MapPost("/api/admin/events/{eventId:int}/prizes", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int eventId, AdminPrizeCreateDto dto) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();
                if (string.IsNullOrWhiteSpace(dto.Nombre)) return Results.BadRequest(new { error = "Nombre requerido" });
                if (dto.Peso <= 0) return Results.BadRequest(new { error = "Peso debe ser > 0" });
                if (!dto.EsPerdedor && dto.Stock < 0) return Results.BadRequest(new { error = "Stock inválido" });

                var existsEvent = await db.Eventos.AnyAsync(e => e.Id == eventId);
                if (!existsEvent) return Results.BadRequest(new { error = "Evento no existe" });

                var p = new Premio
                {
                    EventoId = eventId,
                    Nombre = dto.Nombre.Trim(),
                    Peso = dto.Peso,
                    Stock = dto.EsPerdedor ? 0 : dto.Stock,
                    SegmentoPerdedor = dto.EsPerdedor,
                    Activo = dto.Activo
                };
                db.Premios.Add(p);
                await db.SaveChangesAsync();
                return Results.Ok(new { p.Id });
            });

            app.MapPut("/api/admin/prizes/{id:int}", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int id, AdminPrizeUpdateDto dto) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var p = await db.Premios.FindAsync(id);
                if (p is null) return Results.NotFound();

                if (!string.IsNullOrWhiteSpace(dto.Nombre)) p.Nombre = dto.Nombre.Trim();
                if (dto.Peso > 0) p.Peso = dto.Peso;

                p.SegmentoPerdedor = dto.EsPerdedor;
                p.Activo = dto.Activo;

                if (!p.SegmentoPerdedor) p.Stock = Math.Max(0, dto.Stock); else p.Stock = 0;

                await db.SaveChangesAsync();
                return Results.Ok(new { p.Id });
            });

            app.MapDelete("/api/admin/prizes/{id:int}", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int id) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var p = await db.Premios.FindAsync(id);
                if (p is null) return Results.NotFound();

                var usado = await db.Jugadas.AnyAsync(j => j.PremioId == id);
                if (usado) return Results.BadRequest(new { error = "No se puede borrar: ya tiene jugadas asociadas." });

                db.Premios.Remove(p);
                await db.SaveChangesAsync();
                return Results.Ok(new { ok = true });
            });

            // ======= USUARIOS (listado con búsqueda y paginación) =======
            // ================== USUARIOS ==================
            app.MapGet("/api/admin/users", async (
                HttpRequest req, AppDbContext db, IConfiguration cfg,
                int? eventId, int page = 1, int pageSize = 20, string? q = null) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 200) pageSize = 20;

                var query = db.Usuarios.AsNoTracking().AsQueryable();
                if (eventId.HasValue) query = query.Where(u => u.EventoId == eventId.Value);

                if (!string.IsNullOrWhiteSpace(q))
                {
                    var t = q.Trim().ToLower();
                    query = query.Where(u =>
                        (u.Nombre != null && u.Nombre.ToLower().Contains(t)) ||
                        (u.Email != null && u.Email.ToLower().Contains(t)) ||
                        (u.Telefono != null && u.Telefono.Contains(q)));
                }

                var total = await query.CountAsync();
                var items = await query
                    .OrderByDescending(u => u.Id)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(u => new { u.Id, u.EventoId, u.Nombre, u.Email, u.Telefono, u.AceptoTerminos })
                    .ToListAsync();

                var ids = items.Select(i => i.Id).ToList();
                var jugados = await db.Jugadas
                    .Where(j => ids.Contains(j.UsuarioId) && (!eventId.HasValue || j.EventoId == eventId.Value))
                    .Select(j => j.UsuarioId)
                    .Distinct()
                    .ToListAsync();

                var items2 = items.Select(i => new {
                    i.Id,
                    i.EventoId,
                    i.Nombre,
                    i.Email,
                    i.Telefono,
                    i.AceptoTerminos,
                    Jugo = jugados.Contains(i.Id)
                });

                return Results.Ok(new { total, page, pageSize, items = items2 });
            });

            // ================== DASHBOARD ==================
            app.MapGet("/api/admin/dashboard", async (HttpRequest req, AppDbContext db, IConfiguration cfg, int eventId) =>
            {
                if (!IsAdmin(req, cfg)) return Results.Unauthorized();

                var totalUsuarios = await db.Usuarios.CountAsync(u => u.EventoId == eventId);
                var jugadasTotales = await db.Jugadas.CountAsync(j => j.EventoId == eventId);
                var ganadores = await db.Jugadas.CountAsync(j => j.EventoId == eventId && j.PremioId != null);
                var perdedores = await db.Jugadas.CountAsync(j => j.EventoId == eventId && j.PremioId == null);

                var premios = await db.Premios
                    .Where(p => p.EventoId == eventId)
                    .Select(p => new { p.Id, p.Nombre, p.Stock, p.SegmentoPerdedor, p.Peso })
                    .ToListAsync();

                var entregados = await db.Jugadas
                    .Where(j => j.EventoId == eventId && j.PremioId != null)
                    .GroupBy(j => j.PremioId!.Value)
                    .Select(g => new { PremioId = g.Key, Cant = g.Count() })
                    .ToListAsync();

                var det = premios.Select(p => new {
                    premioId = p.Id,
                    nombre = p.Nombre,
                    esPerdedor = p.SegmentoPerdedor,
                    peso = p.Peso,
                    stockActual = p.Stock,
                    entregados = entregados.FirstOrDefault(x => x.PremioId == p.Id)?.Cant ?? 0
                }).ToList();

                var stockRestante = det.Where(d => !d.esPerdedor).Sum(d => d.stockActual);

                return Results.Ok(new
                {
                    totalUsuarios,
                    jugadasTotales,
                    ganadores,
                    perdedores,
                    stockRestante,
                    premios = det
                });
            });

            return app;
        }
    }
}
