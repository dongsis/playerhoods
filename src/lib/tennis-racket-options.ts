export type TennisRacketOptionGroup = {
  brand: string
  rackets: string[]
}

// First-pass profile picker list for mainstream adult tennis rackets.
// Goal: recognizable 2016-present models without turning this into a commerce catalog.
export const TENNIS_RACKET_OPTION_GROUPS: TennisRacketOptionGroup[] = [
  {
    brand: 'Yonex',
    rackets: [
      'Yonex EZONE DR 98',
      'Yonex EZONE DR 100',
      'Yonex EZONE 98',
      'Yonex EZONE 98+',
      'Yonex EZONE 100',
      'Yonex EZONE 100L',
      'Yonex EZONE 105',
      'Yonex VCORE SV 98',
      'Yonex VCORE SV 100',
      'Yonex VCORE 95',
      'Yonex VCORE 98',
      'Yonex VCORE 100',
      'Yonex VCORE 100L',
      'Yonex VCORE PRO 97',
      'Yonex VCORE PRO 100',
      'Yonex PERCEPT 97',
      'Yonex PERCEPT 100',
      'Yonex PERCEPT 100D',
    ],
  },
  {
    brand: 'Wilson',
    rackets: [
      'Wilson Blade 98 16x19 V8',
      'Wilson Blade 98 18x20 V8',
      'Wilson Blade 98 16x19 V9',
      'Wilson Blade 98 18x20 V9',
      'Wilson Blade 100L V9',
      'Wilson Clash 100 V1',
      'Wilson Clash 100 V2',
      'Wilson Clash 100 V3',
      'Wilson Clash 100 Pro V2',
      'Wilson Clash 100 Pro V3',
      'Wilson Clash 100L V3',
      'Wilson Pro Staff 97 V13',
      'Wilson Pro Staff 97 V14',
      'Wilson Ultra 100 V4',
      'Wilson Ultra 100 V5',
      'Wilson Shift 99 V1',
    ],
  },
  {
    brand: 'Babolat',
    rackets: [
      'Babolat Pure Drive 2021',
      'Babolat Pure Drive Team 2021',
      'Babolat Pure Drive Lite 2021',
      'Babolat Pure Drive 98',
      'Babolat Pure Aero 2019',
      'Babolat Pure Aero 2023',
      'Babolat Pure Aero 98',
      'Babolat Pure Aero Team 2023',
      'Babolat Pure Aero Rafa',
      'Babolat Pure Strike 16x19 2017',
      'Babolat Pure Strike 16x19 2024',
      'Babolat Pure Strike 18x20 2024',
      'Babolat Pure Strike 100 2024',
    ],
  },
  {
    brand: 'HEAD',
    rackets: [
      'HEAD Speed MP 2022',
      'HEAD Speed MP 2024',
      'HEAD Speed Pro 2022',
      'HEAD Speed Pro 2024',
      'HEAD Gravity MP 2019',
      'HEAD Gravity MP 2023',
      'HEAD Radical MP 2021',
      'HEAD Radical MP 2023',
      'HEAD Boom MP 2022',
      'HEAD Boom MP 2024',
      'HEAD Extreme MP 2022',
    ],
  },
  {
    brand: 'Tecnifibre',
    rackets: [
      'Tecnifibre T-FIGHT 300 XTC',
      'Tecnifibre T-FIGHT 300 RS',
      'Tecnifibre T-FIGHT ISO 300',
      'Tecnifibre T-FIGHT 300',
      'Tecnifibre T-FIGHT 300S',
      'Tecnifibre TF-40 305 16M',
      'Tecnifibre TF-X1 300',
    ],
  },
  {
    brand: 'Dunlop',
    rackets: [
      'Dunlop CX 200 2021',
      'Dunlop CX 200 2024',
      'Dunlop CX 400 Tour',
      'Dunlop FX 500 2020',
      'Dunlop FX 500 2025',
      'Dunlop SX 300 2022',
      'Dunlop SX 300 2025',
      'Dunlop SX 300 Tour 2022',
    ],
  },
]

// Kept separate until we verify broader recognition and naming consistency.
export const TENNIS_RACKET_UNCERTAIN_OPTIONS: TennisRacketOptionGroup[] = [
  {
    brand: 'Yonex',
    rackets: [
      'Yonex EZONE 98 TOUR',
      'Yonex VCORE 98 TOUR',
    ],
  },
  {
    brand: 'Wilson',
    rackets: [
      'Wilson Ultra 99 Pro V5',
      'Wilson Pro Staff X V14',
    ],
  },
  {
    brand: 'Babolat',
    rackets: [
      'Babolat Pure Aero Rafa Origin',
    ],
  },
  {
    brand: 'HEAD',
    rackets: [
      'HEAD Prestige MP 2023',
      'HEAD Gravity Tour 2023',
    ],
  },
  {
    brand: 'Tecnifibre',
    rackets: [
      'Tecnifibre T-FIGHT 305S',
    ],
  },
  {
    brand: 'Dunlop',
    rackets: [
      'Dunlop FX 500 Tour',
    ],
  },
]

export const TENNIS_RACKET_OPTIONS = TENNIS_RACKET_OPTION_GROUPS.flatMap((group) => group.rackets)

