---
description: Build and deploy to both Samsung Device and Emulator
---

1. Build Web Assets & Sync
   npm run build && npx cap sync

2. Deploy to Samsung Device
   // turbo
   npx cap run android --target RZCY613LBLA

3. Deploy to Emulator
   // turbo
   npx cap run android --target Medium_Phone_API_36.0
