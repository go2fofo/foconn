/*
 * @Author: fofo
 * @Date: 2026-06-08 13:50:13
 * @LastEditTime: 2026-06-08 13:50:14
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/i18n.ts
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { zh } from './locales/zh';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en,
      zh
    },
    lng: 'zh', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
