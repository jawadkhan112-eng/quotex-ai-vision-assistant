# WINDOWS INSTALLATION & COMMAND GUIDE

### Command Prompt (cmd.exe) / PowerShell Commands

```cmd
:: 1. Navigate to project root
cd /d "C:\Users\jawad khan\CodeGPT\qav"

:: 2. Install required packages
npm install

:: 3. Run full automated test suite
npm test

:: 4. Launch full-stack application (Web Dashboard + Express Backend)
npm run dev

:: 5. Launch Electron Desktop Application locally
npm run desktop

:: 6. Package standalone Windows NSIS EXE Installer
npm run package:windows
```

The compiled Windows installer EXE will be located in:
`C:\Users\jawad khan\CodeGPT\qav\dist-electron\Quotex AI Vision Assistant Setup 1.0.0.exe`
