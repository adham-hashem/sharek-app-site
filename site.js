(() => {
  const stored = localStorage.getItem('sharek-site-language');
  const initial = stored === 'en' || stored === 'ar' ? stored : 'ar';
  const applyLanguage = (language) => {
    const lang = language === 'en' ? 'en' : 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.dataset.language = lang;
    document.querySelectorAll('[data-language-toggle]').forEach((button) => {
      button.textContent = lang === 'ar' ? 'EN' : 'عربي';
      button.setAttribute('aria-label', lang === 'ar' ? 'Switch language to English' : 'غيّر اللغة إلى العربية');
    });
    localStorage.setItem('sharek-site-language', lang);
  };
  applyLanguage(initial);
  document.querySelectorAll('[data-language-toggle]').forEach((button) => {
    button.addEventListener('click', () => applyLanguage(document.documentElement.lang === 'ar' ? 'en' : 'ar'));
  });
  document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = String(new Date().getFullYear()); });
})();
