# Android CLI Workflow Guide

This project is configured to work with VS Code. You can build, install, and debug the Android app directly from the terminal.

## Prerequisites
- **Java/JDK**: Ensure you have JDK 17 or higher installed (`java -version`).
- **Android SDK**: Ensure `ANDROID_HOME` is set in your environment variables.

## Common Commands

All commands should be run from the `android/` directory.

### 1. Build the APK via Terminal
To build the debug APK:
```bash
cd android
./gradlew assembleDebug
```
The APK will be located at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 2. Install on Device
Connect your Android device via USB (ensure USB Debugging is enabled).
```bash
cd android
./gradlew installDebug
```

### 3. Run & View Logs (Logcat)
To build, install, launch the app, and follow the logs in one command:
```bash
cd android
./gradlew installDebug
adb logcat *:S output:V
```
*Note: `adb` must be in your PATH.*

### 4. Capacitor Updates
If you make changes to the web code (`src/`, `public/`), run:
```bash
npm run build
npx cap sync
```
Then run the install command again to update the app on the device.

### 5. Cleaning the Project
If you encounter build issues:
```bash
cd android
./gradlew clean
```

## Troubleshooting
- **Permission Denied for ./gradlew**: Run `chmod +x android/gradlew`.
- **SDK Location**: Create a `local.properties` file in `android/` with:
  ```properties
  sdk.dir=/Users/YOUR_USER/Library/Android/sdk
  ```
