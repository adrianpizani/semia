FROM node:22-alpine

# 1. Establecer directorio de trabajo
WORKDIR /app

# 2. Copiar manifiestos e instalar dependencias (se aprovecha la cache de Docker)
COPY package.json package-lock.json ./
RUN npm install

# 3. Copiar el resto del código de la aplicación
COPY . .

# 4. Exponer puerto y ejecutar el servidor de desarrollo de Next.js
EXPOSE 3000
CMD ["npm", "run", "dev"]