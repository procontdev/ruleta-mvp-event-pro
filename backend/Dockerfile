# ===== Stage 1: Build =====
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copia el csproj y restaura primero (cachea dependencias)
COPY ./Ruleta.Api/*.csproj ./Ruleta.Api/
RUN dotnet restore ./Ruleta.Api/Ruleta.Api.csproj

# Copia el resto del código y publica
COPY ./Ruleta.Api/ ./Ruleta.Api/
WORKDIR /src/Ruleta.Api
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# ===== Stage 2: Runtime =====
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080
ENTRYPOINT ["dotnet","Ruleta.Api.dll"]
