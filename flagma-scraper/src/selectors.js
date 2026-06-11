// Усі CSS-селектори Flagma.ua в одному місці.
// Значення перевірені на живому сайті 2026-06-11 (див. розвідку в плані).
// Зміна розмітки сайту → правити ТІЛЬКИ тут.
export const selectors = {
  list: {
    card: '#message-list .page-list-item',          // картка оголошення у списку
    adMarker: '.google-ads',                          // якщо картка має цей клас — це реклама, пропустити
    cardLink: 'a.photo[href], .page-list-item-header a[href]', // посилання на сторінку оголошення
    nextPage: 'link[rel="next"]',                     // наступна сторінка (head); відсутній → остання сторінка
  },
  detail: {
    title: 'h1',                                      // fallback (основне — JSON-LD name)
    listingType: '.desc-block .message-type',         // "Куплю"/"Продам"
    description: '#description',                       // fallback (основне — JSON-LD description)
    priceBlock: '.retail-price',                      // сирий текст ціни "30 грн/штука"
    priceUnit: '.retail-price .price-unit',           // одиниця "штука" (наразі парситься з тексту priceBlock)
    sellerInfo: '#company-data .company-info > a span', // "Вышка, ТОВ"
    location: '#company-data .company-info .terr',    // текст "Черкаси, UA" + title "Черкаси, Черкаська область, "
    images: '.small-photos-block img',                // мініатюри (src)
    imageBig: '.big-photo #bf',                       // велике фото (fallback)
    updated: '.header-price-container .updated',      // "Оновлено: <span>дата</span>"
    phones: '#contactDialog .phones a.tel',           // телефони продавця (у статичному HTML)
  },
};
