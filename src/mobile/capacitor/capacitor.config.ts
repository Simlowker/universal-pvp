import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.universalpvp.mobile',
  appName: 'Universal PVP',
  webDir: 'out',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: "#0a0a0b",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#0ea5e9",
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0b',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    Haptics: {
      
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0ea5e9",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Camera: {
      
    },
    Geolocation: {
      
    },
    Device: {
      
    },
    App: {
      
    },
    Network: {
      
    },
    Toast: {
      
    },
    Dialog: {
      
    },
    Browser: {
      
    },
    Share: {
      
    },
    Clipboard: {
      
    },
    Storage: {
      
    },
    Filesystem: {
      
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
  ios: {
    scheme: 'Universal PVP',
    contentInset: 'automatic',
    backgroundColor: '#0a0a0b',
    allowsLinkPreview: false,
    handleApplicationURL: true,
    limitsNavigationsToAppBoundDomains: false,
    presentationStyle: 'fullscreen',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    swipeGestureEnabled: true,
    webContentsDebuggingEnabled: false,
  },
  android: {
    backgroundColor: '#0a0a0b',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    appendUserAgent: 'UniversalPVP',
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.120 Mobile Safari/537.36 UniversalPVP',
    hideLogs: true,
    mixedContentMode: 'always_allow',
    startPath: '/mobile',
    useLegacyBridge: false,
    minWebViewVersion: 60,
    flavors: {
      prod: {
        buildOptions: {
          signingConfig: 'release',
          minifyEnabled: true,
          shrinkResources: true,
          proguardEnabled: true,
        }
      },
      dev: {
        buildOptions: {
          signingConfig: 'debug',
          minifyEnabled: false,
          shrinkResources: false,
          proguardEnabled: false,
        }
      }
    }
  },
  bundledWebRuntime: false,
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
    url: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined,
    cleartext: true,
    allowNavigation: [
      'https://*.solana.com',
      'https://*.phantom.app',
      'https://*.solflare.com',
      'https://magicblock.gg',
      'https://*.universalpvp.com',
    ],
    originalUrl: 'https://app.universalpvp.com',
    errorPath: '/error.html',
  },
  includePlugins: [
    '@capacitor/app',
    '@capacitor/haptics',
    '@capacitor/keyboard',
    '@capacitor/status-bar',
    '@capacitor/splash-screen',
    '@capacitor/local-notifications',
    '@capacitor/push-notifications',
    '@capacitor/device',
    '@capacitor/network',
    '@capacitor/storage',
    '@capacitor/filesystem',
    '@capacitor/share',
    '@capacitor/clipboard',
    '@capacitor/browser',
    '@capacitor/toast',
    '@capacitor/dialog',
    '@capacitor/camera',
    '@capacitor/geolocation',
    '@capacitor-community/admob',
    '@capacitor-community/rate-app',
    '@capacitor-community/screen-orientation',
    '@capacitor-community/keep-awake',
  ],
};

export default config;