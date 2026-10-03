# Warehouse Mobile

Aplicativo operacional Android/iOS do Warehouse.

## Servidor

O aplicativo já vem configurado para:

`https://warehouse-orion.onrender.com`

Não existe tela de configuração de servidor.

## Primeira versão

- Login com CPF e senha do Warehouse
- Sessão persistida com token protegido no aparelho
- Launcher no modelo do Docaí
- Módulo Atividades
- 5S
- Amarração
- Selo Vermelho
- Separação
- Captura e compressão de evidência pela câmera

## Rodar no computador

Requer Node.js compatível com Expo SDK 57.

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
npx expo start
```

Para abrir no Android Emulator:

```bash
npm run android
```

## Gerar APK de teste

Com EAS configurado:

```bash
npx eas-cli build --platform android --profile preview
```
