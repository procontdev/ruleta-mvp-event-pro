namespace Ruleta.Api.Dtos
{
    public record RegisterDto(
    int EventId,
    string Nombre,
    string? Email,
    string? Telefono,
    bool AceptoTerminos
);
}
