# build aplikasi pendonor flutter untuk web, lalu sajikan dengan nginx
FROM ghcr.io/cirruslabs/flutter:stable AS build
WORKDIR /src
COPY pubspec.yaml pubspec.lock* ./
RUN flutter pub get
COPY . .
ARG API_BASE=http://localhost:5000
RUN flutter build web --release --dart-define=API_BASE=${API_BASE}

FROM nginx:1.27-alpine
COPY --from=build /src/build/web /usr/share/nginx/html
# single page app: rute yang tidak dikenal kembali ke index.html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
