/**
 * Paintings from the Sakıp Sabancı Museum collection, used by the course.
 * Pick yours here (DEFAULT_PAINTING), from the panel, or with ?painting=<id>
 * in the URL.
 *
 * To use a different SSM painting: put the image in public/paintings/ and add
 * an entry below. Keep the long side at about 1280 px.
 */
export const PAINTINGS = [
  { id: 'kavunlu', file: 'kavunlu.jpg', artist: 'Şeker Ahmed Paşa', title: 'Kavunlu Natürmort' },
  { id: 'kabatas', file: 'kabatas.jpg', artist: 'Feyhaman Duran', title: 'Kabataş Rıhtımı (1936)' },
  { id: 'moda', file: 'moda.jpg', artist: 'Hoca Ali Rıza', title: 'Moda İskelesi' },
  { id: 'selim-turbesi', file: 'selim-turbesi.jpg', artist: 'Şevket Dağ', title: 'II. Selim Türbesi Kapısı' },
  { id: 'ormanda-karaca', file: 'ormanda-karaca.jpg', artist: 'Şeker Ahmed Paşa', title: 'Ormanda Karaca' },
];

export const DEFAULT_PAINTING = 'kavunlu';

export const paintingURL = (p) => `${import.meta.env.BASE_URL}paintings/${p.file}`;
