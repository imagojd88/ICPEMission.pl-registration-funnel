import type { Dict } from './types';

// Opis, bio i rekomendacje: istniejące teksty z icpebook.org/es (z drobnymi poprawkami).
// Elementy interfejsu — tłumaczenie robocze do sprawdzenia.
const es: Dict = {
  htmlLang: 'es',
  nativeName: 'Español',
  title: 'Un rayo de luz',
  subtitle: 'La historia de la Misión ICPE',
  coauthor: 'con A.G. Harmon',
  meta: {
    title: 'Un rayo de luz. La historia de la Misión ICPE — Anna Cappello Fava',
    description: 'Un matrimonio católico de una pequeña isla del Mediterráneo reunió a un grupo de personas para vivir como los primeros cristianos. La historia de la Misión ICPE contada por su cofundadora, Anna Cappello Fava.',
  },
  nav: { book: 'El libro', editions: 'Ediciones', author: 'La autora', endorsements: 'Recomendaciones', gallery: 'Galería', resources: 'Recursos gratuitos', order: 'Pedir el libro', language: 'Idioma', menu: 'Menú' },
  launchBar: { label: 'Presentación de la edición polaca', cta: 'Inscríbete' },
  hero: {
    kicker: 'La historia de la Misión ICPE',
    lede: 'A principios de la década de 1980, un matrimonio católico de una pequeña isla del Mediterráneo reunió a un grupo de personas para vivir como lo hacían los primeros cristianos: como una comunidad abierta a todos y guiada por el Espíritu Santo.',
    primary: 'Pide la edición en inglés',
    primaryHref: 'amazon',
    secondary: 'Descubre el libro',
    note: 'Disponible en inglés. Edición polaca desde octubre de 2026; ediciones italiana y coreana próximamente.',
  },
  promise: { lead: 'Una promesa audaz', text: 'Empezarían donde estaban, pero no se detendrían hasta haber recorrido el mundo entero.' },
  book: {
    h2: 'De una pequeña isla hasta los confines de la tierra',
    p1: 'A principios de la década de 1980, un matrimonio católico de una pequeña isla del Mediterráneo reunió a un grupo de personas para vivir como lo hacían los primeros cristianos: como una comunidad abierta a todos y guiada por el Espíritu Santo. Cuando sus vidas cambiaron radicalmente, se propusieron compartir lo que habían experimentado.',
    p2: 'Esta es su extraordinaria historia, la historia de la Misión ICPE, contada por quien forma parte de ella desde el primer día.',
    insideH: 'En el libro',
    inside: [
      'Cómo de la oración de unas pocas personas en Malta nació una comunidad misionera internacional.',
      'Historias de los lugares a los que fueron enviados misioneros laicos para llevar la luz de Cristo.',
      'Qué significa ser discípulo misionero y cómo formar a otros para la evangelización.',
      'Cuarenta años al frente de una comunidad que vive para la misión.',
    ],
    photoCaption: 'Anna y Mario Cappello con San Juan Pablo II',
    photoAlt: 'Anna y Mario Cappello con San Juan Pablo II',
    coverAlt: 'Portada del libro',
  },
  editions: {
    h2: 'Una historia, muchos idiomas',
    lead: 'El libro viaja como viajó la misión. Elige tu edición.',
    available: 'Disponible',
    launch: 'Presentación',
    soon: 'Próximamente',
    order: 'Pedir en Amazon',
    polish: 'Edición polaca',
    notify: 'Avísame',
  },
  journey: {
    h2: 'El camino que cuenta el libro',
    steps: [
      { year: 'Principios de los 80', place: 'Malta', text: 'Anna y Mario reúnen a personas que desean vivir como los primeros cristianos: una comunidad abierta a todos y guiada por el Espíritu Santo.' },
      { year: '1985', place: 'Malta', text: 'Nace el Instituto para la Evangelización Mundial – Misión ICPE, que empieza a formar y enviar misioneros laicos.' },
      { year: 'Las décadas siguientes', place: 'Todos los continentes', text: 'Los misioneros llegan a algunos de los lugares más difíciles del mundo; nace HopeXchange, el brazo humanitario de la misión.' },
      { year: '2025', place: 'Toda la Iglesia', text: 'El 40.º aniversario de la Misión ICPE y la publicación del libro en inglés.' },
      { year: '2026', place: 'Nuevos idiomas', text: 'La edición polaca se presenta en Cracovia; le siguen las ediciones italiana y coreana.' },
    ],
  },
  author: {
    lead: 'Anna Cappello Fava y su esposo, Mario, cofundaron la Misión ICPE y desde entonces han guiado su crecimiento global, incluido su brazo humanitario, HopeXchange.',
    p1: 'Licenciada en Sagrada Teología (Roma), Anna dedica su tiempo a retiros, formación y atención pastoral en la Misión ICPE. También imparte seminarios con Mario sobre matrimonio, liderazgo y discernimiento.',
    p2: 'Apasionada por la educación y la dignidad de la mujer, fundó un programa educativo para niños desfavorecidos en Ghana y Woman-to-Woman, un ministerio que empodera a mujeres de todo el mundo. Anna y Mario viven en Malta cuando no viajan por motivos ministeriales y misioneros.',
    caption: 'Anna Cappello Fava',
    alt: 'Retrato de Anna Cappello Fava',
  },
  endorsements: {
    h2: 'Lo que dicen del libro',
    count: 'Recomendaciones',
    items: [
      { name: 'Cardenal John Dew', role: 'Arzobispo emérito de Wellington, Nueva Zelanda', text: 'Este libro, Un rayo de luz, necesitaba ser escrito. Hace cuarenta años, un grupo de personas de Malta tuvo la ardiente convicción de que había que vivir el Evangelio con radicalidad y compartirlo libremente. Este libro sobre la fundación de la Misión ICPE, las personas comprometidas con esa misión y su dedicación incondicional a vivir y compartir el Evangelio es oportuno e importante en el mundo de hoy. Gracias, Anna.' },
      { name: 'Dra. Mary Healy', role: 'Profesora de Sagrada Escritura; miembro del Pontificio Consejo para la Promoción de la Unidad de los Cristianos, de la Pontificia Comisión Bíblica y del Dicasterio para el Culto Divino y la Disciplina de los Sacramentos', text: '¡Los misioneros del ICPE son pioneros! En una época en la que pocos católicos hablaban siquiera de evangelización, y mucho menos la practicaban, la Misión ICPE comenzó a formar y enviar laicos para llevar la luz de Cristo a algunos de los lugares más oscuros del mundo. La Iglesia tiene mucho que aprender de esta inspiradora historia.' },
      { name: 'Robert A. Destro J.D.', role: 'Abogado, académico, exsecretario de Estado adjunto de Estados Unidos para Democracia, Derechos Humanos y Trabajo; exmiembro de la Comisión de Derechos Civiles', text: 'Un rayo de luz es una lectura obligada para cualquier católico que anhele «enseñar a todas las naciones» (Mt 28,19) pero no tenga ni idea de por dónde empezar. Es el relato muy personal de la formación y los viajes de una creciente familia mundial de creyentes, contado desde la perspectiva de su madre. Como los discípulos de Hechos 1,14, que «perseveraban unánimes en la oración», estos valientes hombres y mujeres partieron de Malta para ser discípulos «intencionales» de Jesucristo. Su hermosa e inspiradora historia da testimonio de la verdad de que, en el encuentro personal con Jesús, la vida de un evangelista católico es vigorosa, viva y plenamente comprometida.' },
      { name: 'James Hanvey S.J.', role: 'Teólogo, autor y director de retiros; Secretario para el Servicio de la Fe, Curia General de los Jesuitas, Roma', text: 'Un rayo de luz es algo más que las memorias de la fundación y desarrollo de una comunidad extraordinaria. Es una invitación a emprender la aventura del encuentro con un Dios profundamente personal y dinámico que está vivo, activo en nuestro mundo y en nuestras vidas, caminando a nuestro lado, con nosotros y dentro de nosotros. En Un rayo de luz no hay nada aburrido ni formulista. Como Anna y los misioneros del ICPE atestiguan, todos tenemos una llamada y una invitación a entrar en la gran aventura de la misión de Dios en nuestro mundo.' },
      { name: 'Kerry Alys Robinson', role: 'Presidenta y directora ejecutiva de Catholic Charities USA', text: 'La hermosa crónica de Anna Cappello Fava sobre cómo un pequeño grupo de misioneros católicos laicos de la isla de Malta se convirtió en una fuerza global de fe, alegría, servicio y transformación es un bálsamo para el alma. Cualquiera que anhele un mayor significado y una forma de vivir la fe en su máxima expresión encontrará una gran inspiración en este delicioso libro. Un rayo de luz da vida a la alegría del Evangelio a través de una serie de historias convincentes sobre la dedicación a una misión de evangelización en todo el mundo.' },
      { name: 'Cardenal Peter K.A. Turkson', role: 'Canciller de la Pontificia Academia de las Ciencias y de la Pontificia Academia de las Ciencias Sociales', text: 'La historia de la Misión ICPE abarca más de 40 años de dar a conocer a Jesús a través del testimonio, la proclamación y los actos de misericordia en todo el mundo, ¡porque nuestra fe en Dios da forma a nuestra visión del mundo y a nuestro lugar en él!' },
      { name: 'Pino Scafuro', role: 'Moderador, Servicio Internacional de la Renovación Carismática Católica (CHARIS), Ciudad del Vaticano', text: 'Un rayo de luz ilustra cómo la Misión ICPE ha transformado vidas, inspirando a muchos a vivir su fe de forma activa y con todo el corazón. Este libro es un recurso valioso para quienes buscan comprender el papel de los laicos en la evangelización y el servicio dentro de la Iglesia católica. En sus páginas, los lectores cristianos encontrarán inspiración y un llamado a trascender los límites habituales de su camino espiritual. Para quienes buscan el sentido de sus vidas, este libro ofrece una profunda reflexión sobre la posibilidad de abrazar la amistad con Dios.' },
      { name: 'Tony P. Hall', role: 'Embajador y excongresista de los Estados Unidos', text: 'La Misión ICPE es un grupo increíble de personas que sirven a «los más pequeños» (Mateo 25) de este mundo. Van a los lugares más difíciles y remotos del mundo, sin apenas pensar en sí mismos, para servir a los demás. ¡Espero que lean este libro! Es realmente inspirador.' },
      { name: 'Cardenal Mario Grech', role: 'Secretario General, Secretaría General del Sínodo', text: 'Es verdaderamente providencial que la conmemoración del 40.º aniversario de la fundación de la Misión ICPE, un soplo del Espíritu para una Iglesia en misión, coincida con la fase de implementación del último Sínodo sobre la Sinodalidad. La misión y la sinodalidad no pueden existir la una sin la otra: se apoyan mutuamente, crecen en armonía y juntas contribuyen a configurar el camino de la Iglesia en el tercer milenio. […] Espero que este 40.º aniversario sirva como un kairós para los miembros misioneros del ICPE, inspirándolos a abrazar el llamado a la conversión sinodal, un camino que sin duda fortalecerá y apoyará su actividad misionera.' },
    ],
  },
  gallery: { h2: 'Cuarenta años en imágenes', tabs: { community: 'Comunidad', outreach: 'Misión', events: 'Eventos especiales' }, photo: 'Foto del archivo de la Misión ICPE', close: 'Cerrar', prev: 'Foto anterior', next: 'Foto siguiente' },
  resources: {
    h2: 'Recursos gratuitos',
    lead: 'Lee algunas páginas, reza con la comunidad, comparte una cita. Suscríbete para recibir primero los nuevos recursos.',
    items: {
      extracts: { title: 'Extractos', text: 'Algunas páginas del libro para leer antes de comprarlo.' },
      quotes: { title: 'Citas', text: 'Pasajes del libro listos para compartir (en inglés).' },
      prayers: { title: 'Oraciones', text: 'Oraciones para la reflexión personal y en grupo.' },
    },
    download: 'Descargar PDF',
    soon: 'Próximamente',
    newsletter: {
      h: 'Suscríbete al boletín',
      firstName: 'Nombre',
      email: 'Correo electrónico',
      submit: 'Suscribirme',
      gdpr: 'Los datos personales se tratarán de conformidad con el RGPD. Puedes darte de baja en cualquier momento.',
      fallback: 'Escríbenos para suscribirte',
    },
  },
  events: { h2: 'Eventos del libro', lead: 'Conoce a la comunidad que protagoniza esta historia.', title: 'Presentación de la edición polaca', cta: 'Inscríbete en Luma', timeWord: 'a las' },
  footer: {
    about: 'El Instituto para la Evangelización Mundial – Misión ICPE es una comunidad católica internacional comprometida con la formación de discípulos misioneros y la transformación de vidas a través de la alegría del Evangelio.',
    contact: 'Contacto',
    follow: 'Síguenos',
  },
};

export default es;
