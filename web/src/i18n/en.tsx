// English texts. This dictionary defines the shape: es.tsx has to fill exactly the same keys.
// Values with parameters are functions, so each language can order and agree words its own way.
import type { ReactNode } from 'react';
import { plural } from './plural';

export const en = {
  locale: 'en-US',

  common: {
    loading: 'Loading…',
    someone: 'Someone',
    someoneLower: 'someone',
    and: ' and ',
    cancel: 'Cancel',
    save: 'Save',
    back: 'Back',
    close: 'Close',
    logIn: 'Log in',
    yourEmail: 'Your email',
    yourPassword: 'Your password',
    color: 'Color',
    myLot: 'My lot',
    jornadas: (n: number) => plural(n, 'workday', 'workdays'),
    level: (n: number | string) => `level ${n}`,
    of: (value: number | string, total: number | string) => `${value} of ${total}`,
    left: (time: string) => `${time} left`,
    finishing: 'Finishing: it levels up in a few minutes.',
    underConstruction: (building: string, level: number) => `Under construction: ${building} level ${level}`,
  },

  materials: { ladrillo: 'brick', madera: 'wood', energia: 'energy' },
  // "12 brick", "12 de ladrillo".
  amountOf: (amount: number | string, material: string) => `${amount} ${material}`,

  buildings: {
    ladrilleria: 'Brickworks',
    aserradero: 'Sawmill',
    generador: 'Generator',
    plaza: 'Plaza',
    residencial: 'Residential',
  },
  // Singular and plural in lowercase, for counting ("3 generators").
  buildingCount: {
    ladrilleria: ['brickworks', 'brickworks'],
    aserradero: ['sawmill', 'sawmills'],
    generador: ['generator', 'generators'],
    plaza: ['plaza', 'plazas'],
    residencial: ['residential building', 'residential buildings'],
  } as Record<string, [string, string]>,

  // The palette names come from cities.config.palette.
  colors: {
    terracota: 'terracotta',
    ocre: 'ochre',
    oliva: 'olive',
    teal: 'teal',
    azul: 'blue',
    lila: 'lilac',
    rosa: 'pink',
    gris: 'gray',
  } as Record<string, string>,

  lotState: { activo: 'active', descuidado: 'neglected', abandonado: 'abandoned' } as Record<string, string>,
  workStatus: { en_curso: 'in progress', completada: 'completed' } as Record<string, string>,
  barrioStatus: { abierto: 'open', cerrado: 'closed' } as Record<string, string>,
  streetsLevel: { buenas: 'good', gastadas: 'worn', rotas: 'broken' },

  factors: {
    lotes: 'Neighbors around',
    calles: 'Streets',
    abastecimiento: 'Supply',
    obra: 'Neighborhood project',
  },
  // "What hurts most: …".
  reason: {
    lotes: 'the neglected lots',
    calles: 'the streets',
    abastecimiento: 'the lack of production',
    obra: (workName?: string) => (workName ? `the unfinished ${workName}` : 'the unfinished project'),
  },
  mainReason: (reason: string) => (
    <>
      What hurts most: <strong>{reason}</strong>.
    </>
  ),
  nothingMissing: 'Nothing is missing.',

  format: {
    percent: (n: string) => `${n}%`,
    finishing: 'finishing…',
  },

  errors: {
    NO_AUTH: 'Log in with your email and password to continue.',
    NO_PLAYER: "You don't have a lot yet. Open the link from your invitation.",
    ALREADY_PLAYER: 'You already have a lot in the city.',
    BAD_INVITE: 'This invitation no longer works. Ask whoever invited you for another one.',
    LOT_NOT_FREE: 'Someone got there first. Pick another lot.',
    LOT_ISOLATED: 'Pick a lot closer to your neighbors.',
    BAD_COLOR: 'Pick one of the palette colors.',
    NO_JORNADAS: "You're out of workdays for today. You get 3 more tomorrow.",
    NO_MATERIALS: "You're short on materials. Ask your neighbors.",
    NO_LOT: "That lot isn't available.",
    ALREADY_BUILDING: 'Your lot is already under construction.',
    MAX_LEVEL: 'Your building is already at its maximum.',
    TYPE_LOCKED: "The building type can't be changed.",
    NO_CONSTRUCTION: 'That construction already finished.',
    OWN_CONSTRUCTION: 'This is for helping others.',
    OWN_LOT: 'This is for helping others.',
    SELF_GIFT: 'This is for helping others.',
    OTHER_CITY: 'That belongs to another city.',
    NO_WORK: 'That project is already finished.',
    WORK_NEEDS_MATERIALS: 'The project already has all its workdays: now it needs materials.',
    LOT_NOT_NEGLECTED: 'This lot is well looked after.',
    CARE_LIMIT: 'This lot already got all the care it can get.',
    GIFT_TOO_SMALL: 'The minimum gift is 5 units.',
    RENT_MATERIAL: 'Pick which material you will collect as rent.',
    STREETS_FULL: 'The streets are already up to date.',
    STREETS_DONE_TODAY: 'You already maintained these streets today. You can again tomorrow.',
    BAD_AMOUNT: "Amounts can't be negative.",
    NOT_ADMIN: 'This is only for the team.',
    BAD_CREDENTIALS: 'Wrong email or password.',
    EMAIL_TAKEN: 'That email already has an account. Log in with your password.',
    WEAK_PASSWORD: 'The password needs at least 8 characters.',
    BAD_EMAIL: 'Check the email: it looks like it has a typo.',
    TOO_MANY: 'Too many attempts. Wait a minute.',
    SAME_PASSWORD: 'Pick a password different from the previous one.',
    BAD_RECOVERY: 'This password link has expired. Ask for a new one.',
    CONFIRM_EMAIL: 'We sent you an email to confirm the account. Open it and come back to this link.',
    ALREADY_HELPED: 'You already helped with this construction.',
    LOT_NAME_TAKEN: 'Another lot already uses that name.',
    DISPLAY_NAME_TAKEN: 'Someone else already uses that nickname.',
    NAME_LENGTH: 'It has to be between 2 and 24 characters.',
    OFFLINE: 'The connection dropped. Try again when it comes back.',
    UNKNOWN: 'Something went wrong. Try again in a while.',
  } as Record<string, string>,

  login: {
    title: 'Log in to Ciudad Común',
    forgot: 'I forgot my password',
    invitedHint: "Invited but don't have a lot yet? Open the link you were sent.",
    newTitle: 'New password',
    sent: 'Check your email. We sent you a link to choose a new password.',
    intro: "We'll send you a link to choose another one.",
    sendLink: 'Send me the link',
  },

  password: {
    title: 'Password',
    askAnother: 'Request another link',
    choose: 'Choose your password',
    newLabel: (min: number) => `New password (at least ${min} characters)`,
  },

  join: {
    far: 'Far from the neighbors',
    freeLot: 'Free lot',
    pickHint: 'Tap a lot with a dotted border to found yours.',
    suggestedHint: ' The pulsing ones are next to whoever invited you.',
    invitedBy: (inviter: string) => (
      <>
        <strong>{inviter}</strong> invited you to Ciudad Común
      </>
    ),
    invited: "You've been invited to Ciudad Común",
    choosePassword: (min: number) => `Choose a password (at least ${min} characters)`,
    createAndPick: 'Create account and pick a lot',
    haveAccount: 'I already have an account',
    wantAccount: 'I want to create an account',
    yourLot: 'Your lot',
    nickname: 'Your nickname (everyone sees it)',
    lotName: 'Lot name',
    otherLot: 'Another lot',
    foundHere: 'Found it here',
  },

  city: {
    noLot: "You don't have a lot yet. Open your invitation link to found yours.",
    loading: 'Loading the city…',
    invite: 'Invite',
    whatsMissing: "· what's missing",
    jornadasTitle: (value: number, cap: number) => `${value} of ${cap} workdays`,
    seeAll: 'See the whole city',
    opensSoon: 'opens soon',
  },

  admin: {
    loading: 'Loading the panel…',
    title: 'Administration',
    refresh: 'Refresh',
    goToCity: 'Go to the city',
    cityTitle: 'The city',
    players: (players: number, today: number) => (
      <>
        <strong>{players}</strong> players · <strong>{today}</strong> logged in today
      </>
    ),
    lotsFree: (n: number) => (
      <>
        <strong>{n}</strong> free lots
      </>
    ),
    noOccupied: 'no occupied lots',
    constructions: (n: number) => (
      <>
        <strong>{n}</strong> constructions in progress
      </>
    ),
    unsent: (n: number) => (
      <>
        <strong>{n}</strong> unsent notices
      </>
    ),
    works: 'Public works',
    workJornadas: (done: number, total: number) => `(workdays ${done}/${total})`,
    newIn24h: 'New in 24 h',
    nobodyNew: 'Nobody new. Send invitations.',
    barrios: 'Neighborhoods',
    confirmOpen: (name: string) => `Open ${name}? It can't be undone and it notifies the whole city.`,
    since: (when: string) => ` since ${when}`,
    open: 'Open',
    pending: 'Pending notices',
    nothingPending: 'Nothing left to send.',
    to: 'To',
    notice: 'Notice',
    when: 'When',
    markSent: 'Mark sent',
    invitations: 'Unused invitations',
    validLinks: (n: number) => plural(n, 'valid link', 'valid links'),
    expiredLinks: (n: number) => ` · ${n} expired`,
    noInvitations: 'No invitations left. They are created from the "Invite" button in the city.',
    link: 'Link',
    from: 'From',
    expires: 'Expires',
    team: 'the team',
    expired: 'expired',
  },

  // Live toasts, to the player who is online.
  toast: {
    completed: (building: string, level: unknown) => `Your ${building} reached level ${level}.`,
    helped: (who: string) => `${who} helped with your construction.`,
    gift: (who: string, amount: unknown, material: string) => `${who} gave you ${amount} ${material}.`,
    cared: (who: string) => `${who} looked after your lot.`,
    workDone: (name: string) => `The ${name} is finished.`,
    barrioOpened: (name: string) => `${name} opened: there are new lots.`,
  },

  // notifications_outbox notices, which the admin panel shows to copy to WhatsApp.
  notice: {
    building: 'building',
    completed: (building: string, level: unknown) => `Your ${building} is ready: level ${level}.`,
    helped: (helper: unknown) => `${helper} helped with your construction.`,
    gift: (from: unknown, amount: unknown, material: string) => `${from} gave you ${amount} ${material}.`,
    cared: (carer: unknown) => `${carer} looked after your lot while you were away.`,
    neglected: "You haven't been around for days: your lot is neglected and produces half.",
    neighbor: (name: unknown) => `${name} founded their lot next to yours.`,
    workDone: (name: unknown) => `The ${name} is finished: the whole neighborhood produces more.`,
    barrioOpened: (name: unknown) => `${name} opened: there are new lots to invite people to.`,
  },

  myLot: {
    yourLot: 'Your lot',
    maxed: 'Your building is already at its maximum.',
    rename: 'Change the name',
    lotName: 'Lot name',
    lotColor: 'Lot color',
    base: (rate: string) => `${rate}/h base`,
    plazaBonus: (pct: string, many: boolean) => `+${pct} ${many ? 'neighboring plazas' : 'neighboring plaza'}`,
    workBonus: 'neighborhood project',
    stateLoss: (pct: string, state: string) => `−${pct} ${state}`,
    appealFactor: (pct: string) => `× ${pct} appeal`,
    rate: (amount: string, material: string, rent: boolean) =>
      `${amount} ${material} per hour${rent ? ' in rent' : ''}`,
    plazaInfo: (pct: string) => `The plaza doesn't produce: it adds +${pct} to each adjacent lot.`,
    houses: (n: number) => `Houses ${plural(n, 'citizen', 'citizens')}.`,
    appeal: (pct: string) => `Neighborhood appeal: ${pct}`,
    whatBuild: 'What will you build?',
    scarce: 'Scarce in your neighborhood:',
    buildingType: 'Building type',
    produces: (material: string) => `produces ${material}`,
    residentialHint: (n: number) => `houses ${n} and collects rent`,
    plazaHint: (pct: string) => `+${pct} to the neighbors`,
    upgradeTo: (level: number) => `Upgrade to level ${level}`,
    willHouse: (n: number) => `It will house ${plural(n, 'citizen', 'citizens')}.`,
    cost: 'Cost',
    short: (n: number) => ` · you're ${n} short`,
    build: (first: boolean, hours: string) => `${first ? 'Build' : 'Upgrade'} (1 workday, ${hours})`,
    askNeighbors: 'Ask your neighbors',
    nobodyProduces: 'nobody in your neighborhood produces it yet',
    rentQuestion: 'What will you collect as rent?',
    rentMaterial: 'Rent material',
    rentInfo: (n: number, pct: string, amount: string) =>
      `Houses ${n} citizens. Rent depends on the neighborhood's appeal: today ${pct}, about ${amount} per hour.`,
    helpedBy: (names: string) => `Helped: ${names}`,
    nobodyHelped: 'Nobody has helped yet.',
    visitsTitle: 'Who stopped by',
    noVisits: (days: number) => `Nobody stopped by in the last ${days} days.`,
    visitors: (n: number, days: number) => `· ${plural(n, 'neighbor', 'neighbors')} in ${days} days`,
  },

  otherLot: {
    aroundSince: (day: string) => ` · around since ${day}`,
    nothingBuilt: "Hasn't built anything yet.",
    active: 'Active',
    abandoned: (days: number) => `Abandoned ${plural(days, 'day', 'days')} ago`,
    away: (days: number) => `Hasn't been around for ${plural(days, 'day', 'days')}`,
    help: (hours: number) => `Help (1 workday, −${hours} h)`,
    careTitle: 'Look after the lot',
    careLeft: (n: number) => `${plural(n, 'care', 'cares')} left until the owner comes back.`,
    careFull: 'It already got all the care it can until they come back.',
    care: (days: number) => `Look after it (1 workday, +${days} days)`,
    giftTitle: 'Give materials',
    giftMaterial: 'Material to give',
    have: (n: number) => `I have ${n}`,
    amount: 'Amount',
    sent: (amount: number, material: string, name: string) => `You gave ${amount} ${material} to ${name}.`,
    give: 'Give',
  },

  work: {
    theCity: 'The city',
    doneBonus: (pct: string) => `project finished: +${pct} production`,
    pendingBonus: (pct: string) => `once finished, +${pct} production for every lot in the neighborhood`,
    jornadas: 'workdays',
    missing: (n: number) => ` · ${n} to go`,
    contribute: 'Contribute',
    ofHave: (n: number) => `of ${n}`,
    contributeButton: 'Contribute (1 workday)',
    builtBy: 'Who built it',
    contributors: 'Who contributed',
    noContributors: 'Nobody has contributed yet. You can be the first.',
    contributions: (n: number) => plural(n, 'contribution', 'contributions'),
  },

  invite: {
    message: 'I saved you a lot next to mine in Ciudad Común: ',
    label: 'Invite',
    title: 'Invite someone',
    info: 'Each link works only once. Whoever opens it can found their lot near yours.',
    generating: 'Generating the link…',
    copied: 'Copied.',
    copy: 'Copy',
    whatsapp: 'Send via WhatsApp',
  },

  barrio: {
    occupied: (taken: number, total: number) => `${taken} of ${total} lots taken`,
    free: (n: number) => ` · ${plural(n, 'free lot', 'free lots')}`,
    productionTitle: 'Production per hour',
    scarcest: ' · the scarcest',
    builtTitle: "What's built",
    buildingCount: (n: number, one: string, many: string) => plural(n, one, many),
    emptyLots: (n: number) => plural(n, 'lot without a building', 'lots without a building'),
    workDone: 'Project finished: the neighborhood produces more.',
    workBuilt: (pct: string) => `${pct} built`,
    seeWork: 'See the project',
    trendUp: 'more arrive tomorrow',
    trendDown: 'people leave tomorrow',
    citizens: 'Citizens',
    opensSoon: 'Opens soon.',
    lotsWithBuilding: (n: number) => plural(n, 'lot with a building', 'lots with a building'),
    residentials: (n: number) => plural(n, 'residential building', 'residential buildings'),
    citizensLine: (population: string, target: string) => (
      <>
        <strong>{population}</strong> of {target} citizens
      </>
    ),
    roomFor: (n: string, housing: string) => `There's room for ${n}: ${housing}.`,
    nobodyLives: (n: number) => `Nobody lives here yet: each lot with a building makes room for ${n}.`,
    streets: 'Streets',
    streetsState: (shown: number, level: string) => (
      <>
        Condition <strong>{shown}</strong> of 100 · {level}
      </>
    ),
    decay: (decay: number, points: number) => `They wear down ${decay} per day; each maintenance adds ${points}.`,
    oneJornada: '1 workday',
    upToDate: "They're up to date.",
    doneToday: 'You already maintained them today. You can again tomorrow.',
    shortOf: (materials: string, cost: string) => `You need ${materials}: it costs ${cost}.`,
    maintain: (cost: string) => `Maintain (${cost})`,
    maintainedBy: (who: string) => `Maintained by: ${who}.`,
    nobodyMaintained: 'Nobody maintained them this week.',
  },

  summary: {
    title: 'While you were away',
    more: (n: number) => `and ${plural(n, 'more thing', 'more things')}`,
    seeCity: 'See the city',
    completed: (building: string, level: string) => (
      <>
        Your <strong>{building}</strong> reached level {level}.
      </>
    ),
    helped: (who: ReactNode, _n: number) => <>{who} helped with your construction.</>,
    gift: (who: string, amount: string, material: string) => (
      <>
        <strong>{who}</strong> gave you {amount} {material}.
      </>
    ),
    cared: (who: ReactNode, _n: number) => <>{who} looked after your lot.</>,
    workDone: (name?: string) =>
      name ? (
        <>
          The <strong>{name}</strong> is finished.
        </>
      ) : (
        <>The neighborhood project is finished.</>
      ),
    workProgress: (name: string, from: string, to: string) => (
      <>
        The <strong>{name}</strong> went from {from} to {to}.
      </>
    ),
    barrioOpened: (name: string) => (
      <>
        <strong>{name}</strong> opened.
      </>
    ),
    citizens: (barrio: string | undefined, arrived: number, left: number) => (
      <>
        Citizens of <strong>{barrio ?? 'the neighborhood'}</strong>:{' '}
        {arrived > 0 && (
          <>
            <strong>{arrived}</strong> arrived
          </>
        )}
        {arrived > 0 && left > 0 && ', '}
        {left > 0 && (
          <>
            <strong>{left}</strong> left
          </>
        )}
        .
      </>
    ),
    streets: (level: string, shown: number, cost: string[]) => (
      <>
        The neighborhood's streets are <strong>{level}</strong> ({shown} of 100). Maintaining them costs 1 workday
        {cost.length > 0 && ` and ${cost.join(' and ')}`}.
      </>
    ),
    rent: (pct: string, amount: string) => (
      <>
        Your <strong>residential building</strong> collected rent at <strong>{pct}</strong>: you got <strong>{amount}</strong>.
      </>
    ),
    joined: (who: ReactNode, n: number) => (
      <>
        {who} {n === 1 ? 'founded their lot' : 'founded their lots'} near yours.
      </>
    ),
    visits: (n: number) => (
      <>
        <strong>{plural(n, 'neighbor', 'neighbors')}</strong> stopped by your lot.
      </>
    ),
    collected: (amount: string) => (
      <>
        You collected <strong>{amount}</strong>.
      </>
    ),
  },
};

export type Messages = typeof en;
