import { createContext, useContext, useState, useEffect, createElement, type ReactNode } from "react";

export type Language = "en" | "es" | "fr" | "ar";

export const LANGUAGES: { code: Language; label: string; flag: string; dir?: "rtl" }[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" },
];

export const translations: Record<Language, Record<string, string>> = {
  en: {
    "sidebar.newChat": "New Chat",
    "sidebar.search": "Search conversations…",
    "sidebar.noConversations": "No conversations yet",
    "sidebar.analytics": "Analytics",
    "sidebar.admin": "Admin",
    "sidebar.profile": "Profile",
    "sidebar.folders": "Folders",
    "sidebar.allChats": "All Chats",
    "sidebar.newFolder": "New folder",
    "sidebar.pinnedChats": "Pinned",
    "sidebar.folderName": "Folder name",
    "input.placeholder": "Message Claude…",
    "input.send": "Send",
    "input.stop": "Stop",
    "chat.empty.title": "What can I help with?",
    "chat.empty.subtitle": "Ask me anything",
    "auth.login": "Sign in",
    "auth.register": "Create account",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.loginBtn": "Sign In",
    "auth.registerBtn": "Create Account",
    "auth.switchToRegister": "Don't have an account? Sign up",
    "auth.switchToLogin": "Already have an account? Sign in",
    "auth.tagline": "Your personal AI assistant",
    "settings.language": "Language",
    "settings.languageDesc": "Choose the interface language.",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.loading": "Loading…",
  },
  es: {
    "sidebar.newChat": "Nueva conversación",
    "sidebar.search": "Buscar conversaciones…",
    "sidebar.noConversations": "Sin conversaciones aún",
    "sidebar.analytics": "Análisis",
    "sidebar.admin": "Administración",
    "sidebar.profile": "Perfil",
    "sidebar.folders": "Carpetas",
    "sidebar.allChats": "Todos los chats",
    "sidebar.newFolder": "Nueva carpeta",
    "sidebar.pinnedChats": "Anclados",
    "sidebar.folderName": "Nombre de carpeta",
    "input.placeholder": "Mensaje a Claude…",
    "input.send": "Enviar",
    "input.stop": "Detener",
    "chat.empty.title": "¿En qué puedo ayudarte?",
    "chat.empty.subtitle": "Pregúntame cualquier cosa",
    "auth.login": "Iniciar sesión",
    "auth.register": "Crear cuenta",
    "auth.username": "Usuario",
    "auth.password": "Contraseña",
    "auth.loginBtn": "Iniciar Sesión",
    "auth.registerBtn": "Crear Cuenta",
    "auth.switchToRegister": "¿No tienes cuenta? Regístrate",
    "auth.switchToLogin": "¿Ya tienes cuenta? Inicia sesión",
    "auth.tagline": "Tu asistente de IA personal",
    "settings.language": "Idioma",
    "settings.languageDesc": "Elige el idioma de la interfaz.",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.loading": "Cargando…",
  },
  fr: {
    "sidebar.newChat": "Nouvelle discussion",
    "sidebar.search": "Rechercher des conversations…",
    "sidebar.noConversations": "Aucune conversation",
    "sidebar.analytics": "Analytiques",
    "sidebar.admin": "Administration",
    "sidebar.profile": "Profil",
    "sidebar.folders": "Dossiers",
    "sidebar.allChats": "Tous les chats",
    "sidebar.newFolder": "Nouveau dossier",
    "sidebar.pinnedChats": "Épinglés",
    "sidebar.folderName": "Nom du dossier",
    "input.placeholder": "Message à Claude…",
    "input.send": "Envoyer",
    "input.stop": "Arrêter",
    "chat.empty.title": "Comment puis-je vous aider ?",
    "chat.empty.subtitle": "Posez-moi n'importe quelle question",
    "auth.login": "Connexion",
    "auth.register": "Créer un compte",
    "auth.username": "Nom d'utilisateur",
    "auth.password": "Mot de passe",
    "auth.loginBtn": "Se Connecter",
    "auth.registerBtn": "Créer un Compte",
    "auth.switchToRegister": "Pas de compte ? Inscrivez-vous",
    "auth.switchToLogin": "Déjà un compte ? Connectez-vous",
    "auth.tagline": "Votre assistant IA personnel",
    "settings.language": "Langue",
    "settings.languageDesc": "Choisissez la langue de l'interface.",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.loading": "Chargement…",
  },
  ar: {
    "sidebar.newChat": "محادثة جديدة",
    "sidebar.search": "البحث في المحادثات…",
    "sidebar.noConversations": "لا توجد محادثات بعد",
    "sidebar.analytics": "التحليلات",
    "sidebar.admin": "الإدارة",
    "sidebar.profile": "الملف الشخصي",
    "sidebar.folders": "المجلدات",
    "sidebar.allChats": "كل المحادثات",
    "sidebar.newFolder": "مجلد جديد",
    "sidebar.pinnedChats": "المثبتة",
    "sidebar.folderName": "اسم المجلد",
    "input.placeholder": "رسالة إلى كلود…",
    "input.send": "إرسال",
    "input.stop": "إيقاف",
    "chat.empty.title": "كيف يمكنني مساعدتك؟",
    "chat.empty.subtitle": "اسألني أي شيء",
    "auth.login": "تسجيل الدخول",
    "auth.register": "إنشاء حساب",
    "auth.username": "اسم المستخدم",
    "auth.password": "كلمة المرور",
    "auth.loginBtn": "تسجيل الدخول",
    "auth.registerBtn": "إنشاء حساب",
    "auth.switchToRegister": "ليس لديك حساب؟ سجّل الآن",
    "auth.switchToLogin": "لديك حساب بالفعل؟ سجّل دخولك",
    "auth.tagline": "مساعدك الذكاء الاصطناعي الشخصي",
    "settings.language": "اللغة",
    "settings.languageDesc": "اختر لغة الواجهة.",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.delete": "حذف",
    "common.loading": "جارٍ التحميل…",
  },
};

export function t(key: string, lang: Language): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

interface LanguageContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem("app-language") as Language) ?? "en";
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem("app-language", l);
  };

  useEffect(() => {
    const dir = LANGUAGES.find((x) => x.code === lang)?.dir ?? "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const translate = (key: string) => t(key, lang);

  return createElement(LanguageContext.Provider, { value: { lang, setLang, t: translate } }, children);
}

export function useLanguage() {
  return useContext(LanguageContext);
}
