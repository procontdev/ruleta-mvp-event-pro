FROM node:22-alpine
WORKDIR /app

# Copiar manifiestos primero para cachear deps
COPY package*.json ./

# Instalar dependencias (usa ci si hay lockfile)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copiar el resto del código
COPY . .

EXPOSE 5173
# Ejecutar Vite en modo dev y escuchando en todas las interfaces
CMD ["npm","run","dev","--","--host","0.0.0.0"]
