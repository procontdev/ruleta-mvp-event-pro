using Microsoft.EntityFrameworkCore;

namespace Ruleta.Api.Data
{
    public class AppDbContext : DbContext
    {
        public DbSet<Evento> Eventos => Set<Evento>();
        public DbSet<Usuario> Usuarios => Set<Usuario>();
        public DbSet<Premio> Premios => Set<Premio>();
        public DbSet<Jugada> Jugadas => Set<Jugada>();

        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder b)
        {
            b.Entity<Evento>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Nombre).HasMaxLength(150).IsRequired();
                e.Property(x => x.Activo).HasDefaultValue(true);
            });

            b.Entity<Usuario>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Nombre).HasMaxLength(120).IsRequired();
                e.Property(x => x.Email).HasMaxLength(160);
                e.Property(x => x.Telefono).HasMaxLength(40);
                e.HasIndex(x => new { x.EventoId, x.Email }).HasDatabaseName("UX_Usuario_Evento_Email").IsUnique();
                e.HasIndex(x => new { x.EventoId, x.Telefono }).HasDatabaseName("UX_Usuario_Evento_Tel").IsUnique();
            });

            b.Entity<Premio>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Nombre).HasMaxLength(120).IsRequired();
                e.Property(x => x.Peso).HasDefaultValue(0);          // probabilidad relativa (peso)
                e.Property(x => x.Stock).HasDefaultValue(0);
                e.Property(x => x.SegmentoPerdedor).HasDefaultValue(false);
                e.Property(x => x.Activo).HasDefaultValue(true);
                e.HasIndex(x => x.EventoId);
            });

            b.Entity<Jugada>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Resultado).HasMaxLength(80);
                e.HasIndex(x => new { x.EventoId, x.UsuarioId });
                e.HasOne<Usuario>().WithMany().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Cascade);
                e.HasOne<Premio>().WithMany().HasForeignKey(x => x.PremioId).OnDelete(DeleteBehavior.SetNull);
            });
        }
    }
    public class Evento
    {
        public int Id { get; set; }
        public string Nombre { get; set; } = default!;
        public DateTimeOffset CreadoEn { get; set; } = DateTimeOffset.UtcNow;
        public bool Activo { get; set; } = true;
    }

    public class Usuario
    {
        public long Id { get; set; }
        public int EventoId { get; set; }
        public string Nombre { get; set; } = default!;
        public string? Email { get; set; }
        public string? Telefono { get; set; }
        public bool AceptoTerminos { get; set; }
        public DateTimeOffset CreadoEn { get; set; } = DateTimeOffset.UtcNow;
    }

    public class Premio
    {
        public int Id { get; set; }
        public int EventoId { get; set; }
        public string Nombre { get; set; } = default!;
        public int Peso { get; set; }           // peso relativo (probabilidad)
        public int Stock { get; set; }          // stock decreciente, 0 = agotado
        public bool SegmentoPerdedor { get; set; } // true = “sigue intentando” (stock ilimitado)
        public bool Activo { get; set; } = true;
        public DateTimeOffset CreadoEn { get; set; } = DateTimeOffset.UtcNow;
    }

    public class Jugada
    {
        public long Id { get; set; }
        public int EventoId { get; set; }
        public long UsuarioId { get; set; }
        public int? PremioId { get; set; }      // null si pierde
        public string Resultado { get; set; } = default!; // "WIN <premio>" o "LOSE"
        public bool Entregado { get; set; } = false;
        public DateTimeOffset? EntregadoEn { get; set; }
        public DateTimeOffset CreadoEn { get; set; } = DateTimeOffset.UtcNow;
    }
}
