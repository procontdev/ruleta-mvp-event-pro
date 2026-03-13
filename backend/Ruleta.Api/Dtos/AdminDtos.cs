using System.Text.Json.Serialization;

namespace Ruleta.Api.Dtos
{
    public record AdminEventCreateDto([property: JsonPropertyName("nombre")] string Nombre);
    public record AdminEventUpdateDto(string Nombre);

    public record AdminPrizeCreateDto(
        string Nombre,
        int Peso,
        int Stock,
        bool EsPerdedor,
        bool Activo
    );

    public record AdminPrizeUpdateDto(
        string Nombre,
        int Peso,
        int Stock,
        bool EsPerdedor,
        bool Activo
    );
}
