// Mirror of `src/enums/locale_type.ts` on the server. The activity bundle ships
// independently so it can't import the server enum directly; values are kept
// in lockstep manually.
enum Locale {
    EN = "en",
    KO = "ko",
    JA = "ja",
    ES = "es-ES",
    FR = "fr",
    ZH = "zh-CN",
    NL = "nl",
    ID = "id",
    PT = "pt-BR",
    RU = "ru",
    DE = "de",
    HI = "hi",
}

export default Locale;
