// Textos en español. Mismas claves que en.tsx, que es el que define la forma.
import type { ReactNode } from 'react';
import type { Messages } from './en';
import { plural } from './plural';

// "la Escuela", "el Hospital": el artículo sale del nombre de la obra.
const article = (name: string) => (name.endsWith('a') ? 'la' : 'el');

export const es: Messages = {
  locale: 'es-AR',

  common: {
    loading: 'Cargando…',
    someone: 'Alguien',
    someoneLower: 'alguien',
    and: ' y ',
    cancel: 'Cancelar',
    save: 'Guardar',
    back: 'Volver',
    close: 'Cerrar',
    logIn: 'Entrar',
    yourEmail: 'Tu email',
    yourPassword: 'Tu contraseña',
    color: 'Color',
    myLot: 'Mi lote',
    jornadas: (n: number) => plural(n, 'jornada', 'jornadas'),
    level: (n: number | string) => `nivel ${n}`,
    of: (value: number | string, total: number | string) => `${value} de ${total}`,
    left: (time: string) => `Faltan ${time}`,
    finishing: 'Terminando: en unos minutos sube de nivel.',
    underConstruction: (building: string, level: number) => `En obra: ${building} nivel ${level}`,
  },

  materials: { ladrillo: 'ladrillo', madera: 'madera', energia: 'energía' },
  amountOf: (amount: number | string, material: string) => `${amount} de ${material}`,

  buildings: {
    ladrilleria: 'Ladrillería',
    aserradero: 'Aserradero',
    generador: 'Generador',
    plaza: 'Plaza',
    residencial: 'Residencial',
  },
  buildingCount: {
    ladrilleria: ['ladrillería', 'ladrillerías'],
    aserradero: ['aserradero', 'aserraderos'],
    generador: ['generador', 'generadores'],
    plaza: ['plaza', 'plazas'],
    residencial: ['residencial', 'residenciales'],
  },

  colors: {
    terracota: 'terracota',
    ocre: 'ocre',
    oliva: 'oliva',
    teal: 'teal',
    azul: 'azul',
    lila: 'lila',
    rosa: 'rosa',
    gris: 'gris',
  },

  lotState: { activo: 'activo', descuidado: 'descuidado', abandonado: 'abandonado' },
  workStatus: { en_curso: 'en curso', completada: 'completada' },
  barrioStatus: { abierto: 'abierto', cerrado: 'cerrado' },
  streetsLevel: { buenas: 'buenas', gastadas: 'gastadas', rotas: 'rotas' },

  factors: {
    lotes: 'Vecinos presentes',
    calles: 'Calles',
    abastecimiento: 'Abastecimiento',
    obra: 'Obra del barrio',
  },
  reason: {
    lotes: 'los lotes descuidados',
    calles: 'las calles',
    abastecimiento: 'la falta de producción',
    obra: (workName?: string) =>
      workName ? `que falta terminar ${article(workName)} ${workName}` : 'que falta terminar la obra',
  },
  mainReason: (reason: string) => (
    <>
      Lo que más resta: <strong>{reason}</strong>.
    </>
  ),
  nothingMissing: 'No le falta nada.',

  format: {
    percent: (n: string) => `${n} %`,
    finishing: 'terminando…',
  },

  errors: {
    NO_AUTH: 'Entrá con tu email y contraseña para seguir.',
    NO_PLAYER: 'Todavía no tenés lote. Entrá con el link de tu invitación.',
    ALREADY_PLAYER: 'Ya tenés un lote en la ciudad.',
    BAD_INVITE: 'Esta invitación ya no sirve. Pedile otra a quien te invitó.',
    LOT_NOT_FREE: 'Alguien se adelantó. Elegí otro lote.',
    LOT_ISOLATED: 'Elegí un lote más cerca de tus vecinos.',
    BAD_COLOR: 'Elegí uno de los colores de la paleta.',
    NO_JORNADAS: 'Te quedaste sin jornadas por hoy. Mañana tenés 3 más.',
    NO_MATERIALS: 'Te faltan materiales. Pediles a tus vecinos.',
    NO_LOT: 'Ese lote no está disponible.',
    ALREADY_BUILDING: 'Tu lote ya está en obra.',
    MAX_LEVEL: 'Tu edificio ya está al máximo.',
    TYPE_LOCKED: 'El tipo de edificio no se cambia.',
    NO_CONSTRUCTION: 'Esa obra ya terminó.',
    OWN_CONSTRUCTION: 'Esto es para ayudar a otros.',
    OWN_LOT: 'Esto es para ayudar a otros.',
    SELF_GIFT: 'Esto es para ayudar a otros.',
    OTHER_CITY: 'Eso es de otra ciudad.',
    NO_WORK: 'Esa obra ya está terminada.',
    WORK_NEEDS_MATERIALS: 'La obra ya tiene todas sus jornadas: ahora faltan materiales.',
    LOT_NOT_NEGLECTED: 'Este lote está bien cuidado.',
    CARE_LIMIT: 'Este lote ya recibió todos los cuidados posibles.',
    GIFT_TOO_SMALL: 'El regalo mínimo es de 5 unidades.',
    RENT_MATERIAL: 'Elegí qué material vas a cobrar de alquiler.',
    STREETS_FULL: 'Las calles ya están al día.',
    STREETS_DONE_TODAY: 'Hoy ya mantuviste estas calles. Mañana podés de nuevo.',
    BAD_AMOUNT: 'Las cantidades no pueden ser negativas.',
    NOT_ADMIN: 'Esto es solo para el equipo.',
    BAD_CREDENTIALS: 'Email o contraseña incorrectos.',
    EMAIL_TAKEN: 'Ese email ya tiene cuenta. Entrá con tu contraseña.',
    WEAK_PASSWORD: 'La contraseña necesita al menos 8 caracteres.',
    BAD_EMAIL: 'Revisá el email: parece que tiene un error.',
    TOO_MANY: 'Probaste muchas veces. Esperá un minuto.',
    SAME_PASSWORD: 'Elegí una contraseña distinta a la anterior.',
    BAD_RECOVERY: 'Este link de contraseña ya venció. Pedí uno nuevo.',
    CONFIRM_EMAIL: 'Te mandamos un email para confirmar la cuenta. Abrilo y volvé a este link.',
    ALREADY_HELPED: 'Ya ayudaste en esta obra.',
    LOT_NAME_TAKEN: 'Ese nombre ya lo usa otro lote.',
    DISPLAY_NAME_TAKEN: 'Ese apodo ya lo usa otra persona.',
    NAME_LENGTH: 'Tiene que tener entre 2 y 24 caracteres.',
    OFFLINE: 'Se cortó la conexión. Probá de nuevo cuando vuelva.',
    UNKNOWN: 'Algo salió mal. Probá de nuevo en un rato.',
  },

  login: {
    title: 'Entrar a Ciudad Común',
    forgot: 'Olvidé mi contraseña',
    invitedHint: '¿Te invitaron y todavía no tenés lote? Abrí el link que te pasaron.',
    newTitle: 'Contraseña nueva',
    sent: 'Revisá tu email. Te mandamos un link para elegir una contraseña nueva.',
    intro: 'Te mandamos un link para elegir otra.',
    sendLink: 'Mandame el link',
  },

  password: {
    title: 'Contraseña',
    askAnother: 'Pedir otro link',
    choose: 'Elegí tu contraseña',
    newLabel: (min: number) => `Contraseña nueva (mínimo ${min} caracteres)`,
  },

  join: {
    far: 'Lejos de los vecinos',
    freeLot: 'Lote libre',
    pickHint: 'Tocá un lote con borde punteado para fundar el tuyo.',
    suggestedHint: ' Los que laten están al lado de quien te invitó.',
    invitedBy: (inviter: string) => (
      <>
        <strong>{inviter}</strong> te invitó a Ciudad Común
      </>
    ),
    invited: 'Te invitaron a Ciudad Común',
    choosePassword: (min: number) => `Elegí una contraseña (mínimo ${min} caracteres)`,
    createAndPick: 'Crear cuenta y elegir lote',
    haveAccount: 'Ya tengo cuenta',
    wantAccount: 'Quiero crear una cuenta',
    yourLot: 'Tu lote',
    nickname: 'Tu apodo (lo ven todos)',
    lotName: 'Nombre del lote',
    otherLot: 'Otro lote',
    foundHere: 'Fundar acá',
  },

  city: {
    noLot: 'Todavía no tenés lote. Abrí el link de tu invitación para fundar el tuyo.',
    loading: 'Cargando la ciudad…',
    invite: 'Invitar',
    whatsMissing: '· qué falta',
    jornadasTitle: (value: number, cap: number) => `${value} de ${cap} jornadas`,
    seeAll: 'Ver toda la ciudad',
    opensSoon: 'se abre pronto',
  },

  admin: {
    loading: 'Cargando el panel…',
    title: 'Administración',
    refresh: 'Actualizar',
    goToCity: 'Ir a la ciudad',
    cityTitle: 'La ciudad',
    players: (players: number, today: number) => (
      <>
        <strong>{players}</strong> jugadores · <strong>{today}</strong> entraron hoy
      </>
    ),
    lotsFree: (n: number) => (
      <>
        <strong>{n}</strong> lotes libres
      </>
    ),
    noOccupied: 'sin lotes ocupados',
    constructions: (n: number) => (
      <>
        <strong>{n}</strong> construcciones en curso
      </>
    ),
    unsent: (n: number) => (
      <>
        <strong>{n}</strong> avisos sin enviar
      </>
    ),
    works: 'Obras',
    workJornadas: (done: number, total: number) => `(jornadas ${done}/${total})`,
    newIn24h: 'Nuevos en 24 h',
    nobodyNew: 'Nadie nuevo. Mandá invitaciones.',
    barrios: 'Barrios',
    confirmOpen: (name: string) => `¿Abrir el ${name}? No se puede deshacer y le avisa a toda la ciudad.`,
    since: (when: string) => ` desde el ${when}`,
    open: 'Abrir',
    pending: 'Avisos pendientes',
    nothingPending: 'No hay nada sin enviar.',
    to: 'Para',
    notice: 'Aviso',
    when: 'Cuándo',
    markSent: 'Marcar enviado',
    invitations: 'Invitaciones sin usar',
    validLinks: (n: number) => plural(n, 'link vigente', 'links vigentes'),
    expiredLinks: (n: number) => ` · ${n} vencidos`,
    noInvitations: 'No quedan invitaciones. Se crean desde el botón "Invitar" de la ciudad.',
    link: 'Link',
    from: 'De',
    expires: 'Vence',
    team: 'el equipo',
    expired: 'vencida',
  },

  toast: {
    completed: (building: string, level: unknown) => `Tu ${building} subió a nivel ${level}.`,
    helped: (who: string) => `${who} ayudó en tu construcción.`,
    gift: (who: string, amount: unknown, material: string) => `${who} te regaló ${amount} de ${material}.`,
    cared: (who: string) => `${who} cuidó tu lote.`,
    workDone: (name: string) => `Se terminó la obra ${name}.`,
    barrioOpened: (name: string) => `Se abrió el ${name}: hay lotes nuevos.`,
  },

  // Mismos textos que scripts/notify.ts.
  notice: {
    building: 'edificio',
    completed: (building: string, level: unknown) => `Su ${building} está listo: nivel ${level}.`,
    helped: (helper: unknown) => `${helper} ayudó en su construcción.`,
    gift: (from: unknown, amount: unknown, material: string) => `${from} le regaló ${amount} de ${material}.`,
    cared: (carer: unknown) => `${carer} cuidó su lote mientras no estaba.`,
    neglected: 'Hace días que no pasa: su lote está descuidado y produce la mitad.',
    neighbor: (name: unknown) => `${name} fundó su lote al lado del suyo.`,
    workDone: (name: unknown) => `Se terminó la obra ${name}: todo el barrio produce más.`,
    barrioOpened: (name: unknown) => `Se abrió el ${name}: hay lotes nuevos para invitar gente.`,
  },

  myLot: {
    yourLot: 'Tu lote',
    maxed: 'Tu edificio ya está al máximo.',
    rename: 'Cambiar el nombre',
    lotName: 'Nombre del lote',
    lotColor: 'Color del lote',
    base: (rate: string) => `${rate}/h base`,
    plazaBonus: (pct: string, many: boolean) => `+${pct} ${many ? 'plazas vecinas' : 'plaza vecina'}`,
    workBonus: 'obra del barrio',
    stateLoss: (pct: string, state: string) => `−${pct} ${state}`,
    appealFactor: (pct: string) => `× ${pct} de atractivo`,
    rate: (amount: string, material: string, rent: boolean) =>
      `${amount} de ${material} por hora${rent ? ' de alquiler' : ''}`,
    plazaInfo: (pct: string) => `La plaza no produce: suma +${pct} a cada lote pegado.`,
    houses: (n: number) => `Aloja ${plural(n, 'ciudadano', 'ciudadanos')}.`,
    appeal: (pct: string) => `Atractivo del barrio: ${pct}`,
    whatBuild: '¿Qué construís?',
    scarce: 'En tu barrio escasea:',
    buildingType: 'Tipo de edificio',
    produces: (material: string) => `produce ${material}`,
    residentialHint: (n: number) => `aloja ${n} y cobra alquiler`,
    plazaHint: (pct: string) => `+${pct} a los vecinos`,
    upgradeTo: (level: number) => `Mejorar a nivel ${level}`,
    willHouse: (n: number) => `Va a alojar ${plural(n, 'ciudadano', 'ciudadanos')}.`,
    cost: 'Cuesta',
    short: (n: number) => ` · te faltan ${n}`,
    build: (first: boolean, hours: string) => `${first ? 'Construir' : 'Mejorar'} (1 jornada, ${hours})`,
    askNeighbors: 'Pediles a tus vecinos',
    nobodyProduces: 'nadie produce todavía en tu barrio',
    rentQuestion: '¿Qué vas a cobrar de alquiler?',
    rentMaterial: 'Material del alquiler',
    rentInfo: (n: number, pct: string, amount: string) =>
      `Aloja ${n} ciudadanos. El alquiler rinde según el atractivo del barrio: hoy ${pct}, unos ${amount} por hora.`,
    helpedBy: (names: string) => `Ayudaron: ${names}`,
    nobodyHelped: 'Todavía no ayudó nadie.',
    visitsTitle: 'Quién pasó por acá',
    noVisits: (days: number) => `Nadie pasó en los últimos ${days} días.`,
    visitors: (n: number, days: number) => `· ${plural(n, 'vecino', 'vecinos')} en ${days} días`,
  },

  otherLot: {
    aroundSince: (day: string) => ` · por acá desde el ${day}`,
    nothingBuilt: 'Todavía no construyó nada.',
    active: 'Activo',
    abandoned: (days: number) => `Abandonado hace ${plural(days, 'día', 'días')}`,
    away: (days: number) => `Hace ${plural(days, 'día', 'días')} que no viene`,
    help: (hours: number) => `Ayudar (1 jornada, −${hours} h)`,
    careTitle: 'Cuidar el lote',
    careLeft: (n: number) => `Le quedan ${plural(n, 'cuidado', 'cuidados')} hasta que vuelva su dueño.`,
    careFull: 'Ya recibió todos los cuidados posibles hasta que vuelva.',
    care: (days: number) => `Cuidar (1 jornada, +${days} días)`,
    giftTitle: 'Regalar materiales',
    giftMaterial: 'Material a regalar',
    have: (n: number) => `tengo ${n}`,
    amount: 'Cantidad',
    sent: (amount: number, material: string, name: string) => `Le regalaste ${amount} de ${material} a ${name}.`,
    give: 'Regalar',
  },

  work: {
    theCity: 'La ciudad',
    doneBonus: (pct: string) => `obra terminada: +${pct} de producción`,
    pendingBonus: (pct: string) => `al terminarse, +${pct} de producción para todos los lotes del barrio`,
    jornadas: 'jornadas',
    missing: (n: number) => ` · falta ${n}`,
    contribute: 'Aportar',
    ofHave: (n: number) => `de ${n}`,
    contributeButton: 'Aportar (1 jornada)',
    builtBy: 'La construyeron',
    contributors: 'Quiénes aportaron',
    noContributors: 'Todavía no aportó nadie. Podés ser la primera persona.',
    contributions: (n: number) => plural(n, 'aporte', 'aportes'),
  },

  invite: {
    message: 'Te guardé un lote al lado del mío en Ciudad Común: ',
    label: 'Invitar',
    title: 'Invitar a alguien',
    info: 'Cada link sirve una sola vez. Quien lo abra puede fundar su lote cerca del tuyo.',
    generating: 'Generando el link…',
    copied: 'Copiado.',
    copy: 'Copiar',
    whatsapp: 'Mandar por WhatsApp',
  },

  barrio: {
    occupied: (taken: number, total: number) => `${taken} de ${total} lotes ocupados`,
    free: (n: number) => ` · ${plural(n, 'lote libre', 'lotes libres')}`,
    productionTitle: 'Qué se produce por hora',
    scarcest: ' · es lo que más escasea',
    builtTitle: 'Qué hay construido',
    buildingCount: (n: number, one: string, many: string) => plural(n, one, many),
    emptyLots: (n: number) => plural(n, 'lote sin edificio', 'lotes sin edificio'),
    workDone: 'Obra terminada: el barrio produce más.',
    workBuilt: (pct: string) => `${pct} construida`,
    seeWork: 'Ver la obra',
    trendUp: 'mañana llegan más',
    trendDown: 'mañana se va gente',
    citizens: 'Ciudadanos',
    opensSoon: 'Se abre pronto.',
    lotsWithBuilding: (n: number) => plural(n, 'lote con edificio', 'lotes con edificio'),
    residentials: (n: number) => plural(n, 'residencial', 'residenciales'),
    citizensLine: (population: string, target: string) => (
      <>
        <strong>{population}</strong> de {target} ciudadanos
      </>
    ),
    roomFor: (n: string, housing: string) => `Hay lugar para ${n}: ${housing}.`,
    nobodyLives: (n: number) => `Todavía no vive nadie: cada lote con edificio da lugar a ${n}.`,
    streets: 'Calles',
    streetsState: (shown: number, level: string) => (
      <>
        Estado <strong>{shown}</strong> de 100 · {level}
      </>
    ),
    decay: (decay: number, points: number) => `Se gastan ${decay} por día; cada mantenimiento suma ${points}.`,
    oneJornada: '1 jornada',
    upToDate: 'Están al día.',
    doneToday: 'Hoy ya las mantuviste. Mañana podés de nuevo.',
    shortOf: (materials: string, cost: string) => `Te falta ${materials}: cuesta ${cost}.`,
    maintain: (cost: string) => `Mantener (${cost})`,
    maintainedBy: (who: string) => `Las mantuvieron: ${who}.`,
    nobodyMaintained: 'Nadie las mantuvo esta semana.',
  },

  summary: {
    title: 'Mientras no estabas',
    more: (n: number) => `y ${plural(n, 'cosa más', 'cosas más')}`,
    seeCity: 'Ver la ciudad',
    completed: (building: string, level: string) => (
      <>
        Tu <strong>{building}</strong> subió a nivel {level}.
      </>
    ),
    helped: (who: ReactNode, n: number) => (
      <>
        {who} {n === 1 ? 'ayudó' : 'ayudaron'} en tu construcción.
      </>
    ),
    gift: (who: string, amount: string, material: string) => (
      <>
        <strong>{who}</strong> te regaló {amount} de {material}.
      </>
    ),
    cared: (who: ReactNode, n: number) => (
      <>
        {who} {n === 1 ? 'cuidó' : 'cuidaron'} tu lote.
      </>
    ),
    workDone: (name?: string) => (
      <>
        Se terminó la obra <strong>{name ?? 'del barrio'}</strong>.
      </>
    ),
    workProgress: (name: string, from: string, to: string) => (
      <>
        La obra <strong>{name}</strong> avanzó del {from} al {to}.
      </>
    ),
    barrioOpened: (name: string) => (
      <>
        Se abrió el <strong>{name}</strong>.
      </>
    ),
    citizens: (barrio: string | undefined, arrived: number, left: number) => (
      <>
        Ciudadanos del <strong>{barrio ?? 'barrio'}</strong>:{' '}
        {arrived > 0 && (
          <>
            {arrived === 1 ? 'llegó' : 'llegaron'} <strong>{arrived}</strong>
          </>
        )}
        {arrived > 0 && left > 0 && ', '}
        {left > 0 && (
          <>
            {left === 1 ? 'se fue' : 'se fueron'} <strong>{left}</strong>
          </>
        )}
        .
      </>
    ),
    streets: (level: string, shown: number, cost: string[]) => (
      <>
        Las calles del barrio están <strong>{level}</strong> ({shown} de 100). Mantenerlas cuesta 1 jornada
        {cost.length > 0 && ` y ${cost.join(' y ')}`}.
      </>
    ),
    rent: (pct: string, amount: string) => (
      <>
        Tu <strong>residencial</strong> rindió al <strong>{pct}</strong>: cobraste <strong>{amount}</strong>.
      </>
    ),
    joined: (who: ReactNode, n: number) => (
      <>
        {who} {n === 1 ? 'fundó su lote' : 'fundaron sus lotes'} cerca del tuyo.
      </>
    ),
    visits: (n: number) => (
      <>
        <strong>{plural(n, 'vecino pasó', 'vecinos pasaron')}</strong> por tu lote.
      </>
    ),
    collected: (amount: string) => (
      <>
        Recogiste <strong>{amount}</strong>.
      </>
    ),
  },
};
