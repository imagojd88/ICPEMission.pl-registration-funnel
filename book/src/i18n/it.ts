import type { Dict } from './types';

// Opis, bio i rekomendacje: istniejące teksty z icpebook.org/it. Pozostałe elementy
// interfejsu (nawigacja, wydania, oś czasu, materiały) — tłumaczenie robocze do sprawdzenia.
const it: Dict = {
  htmlLang: 'it',
  nativeName: 'Italiano',
  title: 'Un raggio di luce',
  subtitle: 'La storia dell’ICPE Mission',
  coauthor: 'con A.G. Harmon',
  meta: {
    title: 'Un raggio di luce. La storia dell’ICPE Mission — Anna Cappello Fava',
    description: 'Una coppia cattolica su una piccola isola del Mediterraneo riunì un gruppo di persone per vivere come i primi cristiani. La storia dell’ICPE Mission raccontata dalla sua co-fondatrice, Anna Cappello Fava.',
  },
  nav: { book: 'Il libro', editions: 'Edizioni', author: 'L’autrice', endorsements: 'Recensioni', gallery: 'Galleria', resources: 'Risorse gratuite', order: 'Ordina il libro', language: 'Lingua', menu: 'Menu' },
  launchBar: { label: 'Presentazione dell’edizione polacca', cta: 'Iscriviti' },
  hero: {
    kicker: 'La storia dell’ICPE Mission',
    lede: 'All’inizio degli anni ’80, una coppia cattolica su una piccola isola del Mediterraneo riunì un gruppo di persone per vivere come i primi cristiani: come una comunità aperta a tutti e guidata dallo Spirito Santo.',
    primary: 'Ordina l’edizione inglese',
    primaryHref: 'amazon',
    secondary: 'Scopri il libro',
    note: 'L’edizione italiana è in preparazione. Disponibile ora in inglese.',
  },
  promise: { lead: 'Un’audace promessa', text: 'Avrebbero iniziato da dove si trovavano, ma non si sarebbero fermati finché non avessero attraversato il mondo in lungo e in largo.' },
  book: {
    h2: 'Da una piccola isola fino ai confini della terra',
    p1: 'All’inizio degli anni ’80, una coppia cattolica su una piccola isola del Mediterraneo riunì un gruppo di persone per vivere come i primi cristiani: come una comunità aperta a tutti e guidata dallo Spirito Santo. Mentre le loro vite cambiavano radicalmente, decisero di condividere ciò che avevano sperimentato.',
    p2: 'Questa è la loro straordinaria storia: la storia dell’ICPE Mission, raccontata da chi ne fa parte fin dal primo giorno.',
    insideH: 'Nel libro',
    inside: [
      'Come dalla preghiera di poche persone a Malta sia nata una comunità missionaria internazionale.',
      'Storie dai luoghi in cui i missionari laici sono stati inviati a portare la luce di Cristo.',
      'Che cosa significa essere discepoli missionari e come formare altri all’evangelizzazione.',
      'Quarant’anni alla guida di una comunità che vive per la missione.',
    ],
    photoCaption: 'Anna e Mario Cappello con San Giovanni Paolo II',
    photoAlt: 'Anna e Mario Cappello con San Giovanni Paolo II',
    coverAlt: 'Copertina del libro',
  },
  editions: {
    h2: 'Una storia, molte lingue',
    lead: 'Il libro viaggia come ha viaggiato la missione. Scegli la tua edizione.',
    available: 'Disponibile',
    launch: 'Presentazione',
    soon: 'Prossimamente',
    order: 'Ordina su Amazon',
    polish: 'Edizione polacca',
    notify: 'Avvisami',
  },
  journey: {
    h2: 'Il cammino raccontato nel libro',
    steps: [
      { year: 'Inizio anni ’80', place: 'Malta', text: 'Anna e Mario riuniscono persone che desiderano vivere come i primi cristiani: una comunità aperta a tutti e guidata dallo Spirito Santo.' },
      { year: '1985', place: 'Malta', text: 'Nasce l’Institute for World Evangelisation – ICPE Mission, che inizia a formare e inviare missionari laici.' },
      { year: 'I decenni seguenti', place: 'Tutti i continenti', text: 'I missionari raggiungono alcuni dei luoghi più difficili del mondo; nasce HopeXchange, l’iniziativa umanitaria della missione.' },
      { year: '2025', place: 'Tutta la Chiesa', text: 'Il 40° anniversario dell’ICPE Mission e la pubblicazione del libro in inglese.' },
      { year: '2026', place: 'Nuove lingue', text: 'L’edizione polacca viene presentata a Cracovia; seguono le edizioni italiana e coreana.' },
    ],
  },
  author: {
    lead: 'Anna Cappello Fava e suo marito Mario sono i co-fondatori dell’ICPE Mission, che guidano da anni promuovendone la crescita a livello globale, inclusa la sua iniziativa umanitaria, HopeXchange.',
    p1: 'Laureata in Sacra Teologia a Roma, Anna si dedica attivamente ai ritiri spirituali, alla formazione e alla cura pastorale dell’ICPE Mission. Insieme a Mario, conduce seminari su tematiche relative al matrimonio, alla leadership e al discernimento.',
    p2: 'Appassionata di educazione e della dignità femminile, ha avviato un programma educativo per i bambini svantaggiati in Ghana e fondato Woman-to-Woman, un ministero dedicato all’emancipazione delle donne in tutto il mondo. Anna e Mario risiedono a Malta, quando non sono impegnati nei viaggi per il loro ministero e per le opere missionarie.',
    caption: 'Anna Cappello Fava',
    alt: 'Ritratto di Anna Cappello Fava',
  },
  endorsements: {
    h2: 'Che cosa dicono di questo libro',
    count: 'Recensioni',
    items: [
      { name: 'Cardinale John Dew', role: 'Arcivescovo emerito di Wellington, Nuova Zelanda', text: 'Questo libro, “Un Raggio di Luce”, doveva essere scritto. Quarant’anni fa, un gruppo di persone a Malta nutriva la convinzione ardente che il Vangelo dovesse essere vissuto con radicalità e condiviso liberamente. Questo libro sulla fondazione dell’ICPE Mission, su coloro che si impegnano in tale missione e sulla loro sincera dedizione a vivere e condividere il Vangelo, è attuale ed è importante nel mondo di oggi. Grazie Anna.' },
      { name: 'Dott.ssa Mary Healy', role: 'Professoressa di Sacra Scrittura; membro del Pontificio Consiglio per la Promozione dell’Unità dei Cristiani, della Pontificia Commissione Biblica e del Dicastero per il Culto Divino e la Disciplina dei Sacramenti', text: 'I missionari dell’ICPE sono dei pionieri! In un’epoca in cui pochi cattolici parlavano di evangelizzazione, e ancora meno la praticavano, l’ICPE Mission iniziò a formare e inviare laici per portare la luce di Cristo in alcuni dei luoghi più bui del mondo. La Chiesa ha molto da imparare da questa storia ricca di ispirazioni.' },
      { name: 'Robert A. Destro J.D.', role: 'Avvocato, accademico, ex assistente segretario di Stato statunitense per la democrazia, i diritti umani e il lavoro; ex membro della Commissione per i diritti civili', text: '“Un Raggio di Luce” è una lettura che qualsiasi cattolico che desideri “ammaestrare tutte le nazioni” (Mt 28,19) ma non sappia da dove iniziare, non deve perdere. È il racconto molto personale della formazione e dei viaggi di una famiglia di credenti in crescita e diffusa in tutto il mondo, narrato dalla prospettiva della madre. Come i discepoli in Atti 1,14, che “erano assidui e concordi nella preghiera”, questi uomini e queste donne coraggiose sono partiti da Malta per essere discepoli seriamente impegnati a seguire Gesù Cristo. La storia, bellissima e stimolante, testimonia la verità che, nell’incontro personale con Gesù, la vita di un evangelista cattolico è vigorosa, vivace e pienamente impegnata.' },
      { name: 'James Hanvey S.J.', role: 'Teologo, autore e direttore di ritiri; Segretario per il Servizio della Fede, Curia Generale dei Gesuiti, Roma', text: '“Un Raggio di Luce” è più di un semplice ricordo della fondazione e dello sviluppo di una comunità straordinaria. È un invito a intraprendere l’avventura di incontrare un Dio profondamente personale e dinamico, vivo, attivo nel nostro mondo e nelle nostre vite, che cammina accanto a noi, con noi e dentro di noi. In “Un Raggio di Luce” non c’è nulla di noioso o stereotipato. Come testimoniano Anna e i missionari dell’ICPE Mission, tutti noi abbiamo una chiamata e un invito a entrare nella grande avventura della missione di Dio nel mondo.' },
      { name: 'Kerry Alys Robinson', role: 'Presidente e CEO di Catholic Charities, U.S.A.', text: 'La splendida cronistoria di Anna Cappello Fava su come un piccolo gruppo di missionari laici cattolici dell’isola di Malta si sia trasformato in una forza globale di fede, gioia, servizio e trasformazione è un balsamo per l’anima. Chiunque desideri un significato più profondo e un modo per vivere la fede nella sua massima espressione troverà grande ispirazione in questo libro accattivante. “Un Raggio di Luce” fa rivivere la gioia del Vangelo attraverso una serie di storie avvincenti sulla dedizione a una missione di evangelizzazione in tutto il mondo.' },
      { name: 'Cardinale Peter K.A. Turkson', role: 'Cancelliere della Pontificia Accademia delle Scienze e della Pontificia Accademia delle Scienze Sociali', text: 'La storia dell’ICPE Mission abbraccia oltre 40 anni di divulgazione di Gesù attraverso la testimonianza, la proclamazione e gli atti di misericordia in tutto il mondo, perché la nostra fede in Dio plasma la nostra visione del mondo e il nostro posto in esso!' },
      { name: 'Pino Scafuro', role: 'Moderatore, Servizio Internazionale del Rinnovamento Carismatico Cattolico (CHARIS), Città del Vaticano', text: '“Un Raggio di Luce” illustra come l’ICPE Mission abbia trasformato vite, ispirando molti a vivere la propria fede attivamente e con tutto il cuore. Questo libro è una risorsa preziosa per coloro che cercano di comprendere il ruolo dei laici nell’evangelizzazione e nel servizio all’interno della Chiesa cattolica. Tra le sue pagine, i lettori cristiani troveranno ispirazione e un invito ad andare oltre i confini familiari del loro cammino spirituale. Per coloro che cercano un significato nella propria vita, questo libro offre una profonda riflessione sulla possibilità di abbracciare l’amicizia con Dio.' },
      { name: 'Tony P. Hall', role: 'Ambasciatore ed ex membro del Congresso degli Stati Uniti', text: 'L’ICPE Mission è un gruppo straordinario di persone al servizio degli “ultimi” (Matteo 25) di questo mondo. Si recano nelle zone più difficili e remote del mondo senza pensare minimamente a se stessi per servire gli altri. Spero che leggiate questo libro! È davvero stimolante.' },
      { name: 'Cardinale Mario Grech', role: 'Segretario generale, Segreteria Generale del Sinodo', text: 'È davvero provvidenziale che la commemorazione del 40° anniversario di fondazione dell’ICPE Mission – un soffio dello Spirito per una Chiesa in missione – coincida con la fase di attuazione dell’ultimo Sinodo sulla sinodalità. Missione e sinodalità non possono esistere l’una senza l’altra: si sostengono a vicenda, crescono in armonia ed insieme contribuiscono a plasmare il cammino della Chiesa nel terzo millennio. […] Spero che questo 40° anniversario possa fungere da kairos per i missionari dell’ICPE Mission, ispirandoli ad accogliere la chiamata alla conversione sinodale, un cammino che senza dubbio rafforzerà e sosterrà la loro attività missionaria.' },
    ],
  },
  gallery: { h2: 'Quarant’anni in immagini', tabs: { community: 'Comunità', outreach: 'Missione', events: 'Eventi speciali' }, photo: 'Foto dall’archivio dell’ICPE Mission', close: 'Chiudi', prev: 'Foto precedente', next: 'Foto successiva' },
  resources: {
    h2: 'Risorse gratuite',
    lead: 'Leggi qualche pagina, prega con la comunità, condividi una citazione. Iscriviti alla newsletter per ricevere per primo le nuove risorse.',
    items: {
      extracts: { title: 'Estratti', text: 'Alcune pagine del libro da leggere prima dell’acquisto.' },
      quotes: { title: 'Citazioni', text: 'Passi del libro pronti da condividere (in inglese).' },
      prayers: { title: 'Preghiere', text: 'Preghiere per la riflessione personale e per i gruppi.' },
    },
    download: 'Scarica il PDF',
    soon: 'Prossimamente',
    newsletter: {
      h: 'Iscriviti alla newsletter',
      firstName: 'Nome',
      email: 'Email',
      submit: 'Iscriviti',
      gdpr: 'I dati personali saranno trattati in conformità al GDPR. Puoi annullare l’iscrizione in qualsiasi momento.',
      fallback: 'Scrivici per iscriverti',
    },
  },
  events: { h2: 'Eventi del libro', lead: 'Incontra la comunità protagonista di questa storia.', title: 'Presentazione dell’edizione polacca', cta: 'Iscriviti su Luma', timeWord: 'ore' },
  footer: {
    about: 'L’Institute for World Evangelisation – ICPE Mission è una comunità cattolica internazionale impegnata a formare discepoli missionari e a trasformare le vite attraverso la gioia del Vangelo.',
    contact: 'Contatti',
    follow: 'Seguici',
  },
};

export default it;
