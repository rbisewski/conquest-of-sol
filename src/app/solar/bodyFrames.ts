// Body-fixed frames of the bodies drawn from a surface map, from the IAU's rotational elements
// (Archinal et al. 2018, the WGCCRE 2015 report): the north pole's right ascension and
// declination, and W, the prime meridian's angle east along the body's equator from the
// equator's ascending node on the celestial (ICRF) equator. A frame's columns are the scene
// directions of longitude 0°, the north pole and longitude 90° west, the globe's convention
// ((cos lat cos lon, sin lat, −cos lat sin lon)) that bodyArt.ts samples maps in. The Earth's
// frame comes from the globe instead (earthFrame.ts). The Moon, Phobos and Deimos, the great
// moons of Jupiter, Saturn and Uranus, Triton and Charon keep their near sides (longitude 0°)
// towards their planets as they go round, which the IAU's mean rotations only do on average, so
// their meridians are set from where the planet is.
// Display only.

import * as THREE from "three";

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;

interface Rotation {
  /** Pole right ascension and declination (degrees) at J2000 and their drift per Julian century. */
  ra: [number, number];
  dec: [number, number];
  /** Prime meridian at J2000 (degrees) and its turn per day; absent for a body facing its parent. */
  w?: [number, number];
  /**
   * The pole's swing with a precessing node N (degrees at J2000 and per Julian century): the
   * right ascension gains ra[k] sin((k+1)N) and the declination dec[k] cos((k+1)N), degrees.
   */
  swing?: { node: [number, number]; ra: number[]; dec: number[] };
}

/**
 * Sol: the IAU's pole and Carrington's turn (about 25.4 days; drawSun turns its sunspots at their
 * own latitudes' rates against it). Mercury: MESSENGER's pole and spin (the small librations are left out). Venus: its pole, but
 * the cloud tops' turn, not the surface's: they race round westward in about four days. Luna:
 * its mean pole, facing the Earth. Mars: the 2009 elements (the small periodic terms left out).
 * Ceres: Dawn's. Jupiter: System III, the turn of its magnetic field (its clouds have no fixed
 * longitudes). Io, Europa, Ganymede, Callisto: their mean poles (the small periodic terms left
 * out), facing Jupiter. Saturn: System III, as Jupiter (its pole also sets the rings' plane).
 * Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus: their mean poles, facing Saturn.
 * Uranus: its interior's turn (Voyager's radio period). Its pole lies almost in its orbit, and
 * the IAU's north is the one on the north side of the Solar System, so it turns backwards (W
 * falls). Miranda, Ariel, Umbriel, Titania, Oberon: their mean poles (Miranda's 4° wobble left
 * out), facing Uranus. Neptune: its interior's turn, its pole nodding a little with Triton's
 * precessing orbit. Triton: its pole swings round with that orbit, by up to 32°, so its swing is
 * kept; facing Neptune. Pluto: the IAU's (the right-hand rule's north, longitude 0° facing Charon).
 * Small bodies drawn from shape models: Eros, Lutetia, Tempel 1 and Phoebe on the IAU's elements;
 * Saturn's small inner moons, Amalthea, Thebe, Proteus, Larissa and Puck on their mean poles,
 * facing their planets (their long axes towards them); Mathilde's slow 17.4-day turn on an
 * approximate pole; Hyperion, Nix and Hydra tumble chaotically in truth, and Halley's turn is
 * complex, so they turn steadily at about their rates on made-up poles.
 * The made-up asteroids: Pallas on its measured pole (ecliptic 42°, −15°; it lies nearly on its
 * side) and 7.81-hour turn; Ingeborg, Sisyphus, Öpik and Eric at their measured periods, Zeus,
 * Napier and 2014 MQ18 ("Awilix") at made-up ones (none is known), all on made-up poles.
 * The lesser dwarf planets: at their measured periods where known (Varda locked to its moon
 * Ilmarë, 5.75 days), at made-up ones for Máni, Chiminigagua, Izanagi, Farout, Gǃkúnǁʼhòmdímà,
 * DeeDee, 2015 RR245, Huracan, Chaos, 2008 ST291, Nareau, Xewioso, Chernobog, Meng Po, Volturnus,
 * Tagaloa, Enki, Anansi, Coatlicue and Agudar (Marduk's measured one is ambiguous), all on made-up poles and with their prime meridians at 0° at J2000.
 * The next forty, from Kuterastan to Eurytion, at their measured periods where known (the main-belt
 * asteroids, Hektor, Diomedes, Chariklo, Nereid, Hiʻiaka, 1996 TL66, Tawa, Numbakulla, Huya, Erlik),
 * made-up ones otherwise, on made-up poles except Chariklo's (its rings', Braga-Ribas et al. 2014)
 * and Kleopatra's (JPL's).
 * The next forty, from Hermione to Bertha, on made-up poles at their measured periods, but for
 * made-up ones for Ripheus, Hippasus, Leleākūhonua, Deucalion, Sanape, Ephesos and Agrius; Galatea
 * on its mean pole, facing Neptune.
 * Charon: its mean pole, facing Pluto (as Pluto faces it). Vesta: Dawn's pole and spin (the IAU's
 * 2015 elements; the DLR maps' longitudes may sit on an older prime meridian, which only shifts
 * which face is turned our way at a moment, on a body that turns in 5.3 hours).
 * Eris: locked to Dysnomia, so its pole is Dysnomia's orbit pole (Holler et al. 2021) and its day
 * Dysnomia's 15.79 days. Haumea: the pole of its ring and of Hi'iaka's orbit (Ortiz et al. 2017),
 * its 3.92-hour day. Makemake: its 22.83-hour day (Hromakina et al. 2019); its pole is unknown,
 * so it is put square to our line of sight (its moon's orbit is seen edge-on) as near the
 * ecliptic's pole as that allows. Eris's, Haumea's and Makemake's prime meridians are unknown
 * and set at 0° at J2000. Phobos and Deimos: their mean poles with the largest periodic terms
 * (1.8° and 3.1°), facing Mars (the IAU's own meridians add librations as small). The asteroids
 * 1951 Lick (5.30 hours, its light curve database period), 3753 Cruithne (27.31 hours; Larsen
 * 2014) and 52762 Khonsu (12.08 hours) turn at their measured rates, but their poles are unknown
 * and made up, and their prime meridians set at 0° at J2000. So is the comet Arend-Rigaux's
 * nucleus, turning backwards (W falls) in 13.45 hours (Eisner et al. 2017).
 */
const ROTATIONS: Record<string, Rotation> = {
  Sol: { ra: [286.13, 0], dec: [63.87, 0], w: [84.176, 14.1844] },
  Mercury: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], w: [329.5988, 6.1385108] },
  Venus: { ra: [272.76, 0], dec: [67.16, 0], w: [0, -90] },
  Luna: { ra: [269.9949, 0.0031], dec: [66.5392, 0.013] },
  Mars: { ra: [317.68143, -0.1061], dec: [52.8865, -0.0609], w: [176.63, 350.89198226] },
  Ceres: { ra: [291.418, 0], dec: [66.764, 0], w: [170.65, 952.1532] },
  Jupiter: { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], w: [284.95, 870.536] },
  Io: { ra: [268.05, -0.009], dec: [64.5, 0.003] },
  Europa: { ra: [268.08, -0.009], dec: [64.51, 0.003] },
  Ganymede: { ra: [268.2, -0.009], dec: [64.57, 0.003] },
  Callisto: { ra: [268.72, -0.009], dec: [64.83, 0.003] },
  Saturn: { ra: [40.589, -0.036], dec: [83.537, -0.004], w: [38.9, 810.7939024] },
  Mimas: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Enceladus: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Tethys: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Dione: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Rhea: { ra: [40.38, -0.036], dec: [83.55, -0.004] },
  Titan: { ra: [39.4827, 0], dec: [83.4279, 0] },
  Iapetus: { ra: [318.16, -3.949], dec: [75.03, -1.143] },
  Uranus: { ra: [257.311, 0], dec: [-15.175, 0], w: [203.81, -501.1600928] },
  Miranda: { ra: [257.43, 0], dec: [-15.08, 0] },
  Ariel: { ra: [257.43, 0], dec: [-15.1, 0] },
  Umbriel: { ra: [257.43, 0], dec: [-15.1, 0] },
  Titania: { ra: [257.43, 0], dec: [-15.1, 0] },
  Oberon: { ra: [257.43, 0], dec: [-15.1, 0] },
  Neptune: { ra: [299.36, 0], dec: [43.46, 0], w: [249.978, 541.1397757], swing: { node: [357.85, 52.316], ra: [0.7], dec: [-0.51] } },
  Triton: {
    ra: [299.36, 0],
    dec: [41.17, 0],
    swing: { node: [177.85, 52.316], ra: [-32.35, -6.28, -2.08, -0.74, -0.28, -0.11, -0.07, -0.02, -0.01], dec: [22.55, 2.1, 0.55, 0.16, 0.05, 0.02, 0.01] },
  },
  Pluto: { ra: [132.993, 0], dec: [-6.163, 0], w: [302.695, 56.3625225] },
  Charon: { ra: [132.993, 0], dec: [-6.163, 0] },
  "4Vesta": { ra: [309.031, -0.008], dec: [42.235, -0.005], w: [285.39, 1617.3329428] },
  "433Eros": { ra: [11.35, 0], dec: [17.22, 0], w: [326.07, 1639.38864745] },
  "21Lutetia": { ra: [52, 0], dec: [12, 0], w: [94, 1057.7515] },
  "253Mathilde": { ra: [51, 0], dec: [-46, 0], w: [0, 20.684702] },
  Tempel: { ra: [255, 0], dec: [64.5, 0], w: [69, 211.96] },
  Halley: { ra: [190, 0], dec: [30, 0], w: [0, 163.636364] },
  Phoebe: { ra: [356.9, 0], dec: [77.8, 0], w: [178.58, 931.639] },
  Hyperion: { ra: [40, 0], dec: [60, 0], w: [0, 27.692308] },
  Janus: { ra: [40.58, -0.036], dec: [83.52, -0.004] },
  Epimetheus: { ra: [40.58, -0.036], dec: [83.52, -0.004] },
  Prometheus: { ra: [40.58, -0.036], dec: [83.53, -0.004] },
  Pandora: { ra: [40.58, -0.036], dec: [83.53, -0.004] },
  Atlas: { ra: [40.58, -0.036], dec: [83.53, -0.004] },
  Pan: { ra: [40.6, -0.036], dec: [83.5, -0.004] },
  Daphnis: { ra: [40.58, -0.036], dec: [83.52, -0.004] },
  Calypso: { ra: [36.41, -0.036], dec: [85.04, -0.004] },
  Telesto: { ra: [50.51, -0.036], dec: [84.06, -0.004] },
  Helene: { ra: [40.85, -0.036], dec: [83.34, -0.004] },
  Amalthea: { ra: [268.05, -0.009], dec: [64.49, 0.003] },
  Thebe: { ra: [268.05, -0.009], dec: [64.49, 0.003] },
  Proteus: { ra: [299.27, 0], dec: [42.91, 0] },
  Larissa: { ra: [299.36, 0], dec: [43.45, 0] },
  Puck: { ra: [257.31, 0], dec: [-15.18, 0] },
  Nix: { ra: [220, 0], dec: [30, 0], w: [0, 196.811] },
  Hydra: { ra: [80, 0], dec: [20, 0], w: [0, 838.835] },
  "2Pallas": { ra: [44.1, 0], dec: [1.1, 0], w: [0, 1105.81789] },
  "391Ingeborg": { ra: [120, 0], dec: [40, 0], w: [0, 327.384336] },
  "1866Sisyphus": { ra: [300, 0], dec: [55, 0], w: [0, 3600] },
  "2099Öpik": { ra: [200, 0], dec: [-30, 0], w: [0, 1340.990222] },
  "4954Eric": { ra: [15, 0], dec: [62, 0], w: [0, 716.655607] },
  "5731Zeus": { ra: [250, 0], dec: [-20, 0], w: [0, 1183.561644] },
  "7096Napier": { ra: [80, 0], dec: [35, 0], w: [0, 1694.117647] },
  "514041Asteroid": { ra: [170, 0], dec: [-55, 0], w: [0, 900] },
  Gonggong: { ra: [95, 0], dec: [-35, 0], w: [0, 385.714286] },
  Quaoar: { ra: [330, 0], dec: [25, 0], w: [0, 488.687783] },
  "208996KBO": { ra: [160, 0], dec: [50, 0], w: [0, 1272.947] },
  "90482Orcus": { ra: [290, 0], dec: [-20, 0], w: [0, 655.141] },
  Sedna: { ra: [40, 0], dec: [60, 0], w: [0, 841.039619] },
  Salacia: { ra: [210, 0], dec: [15, 0], w: [0, 1418.719212] },
  "307261KBO": { ra: [75, 0], dec: [-45, 0], w: [0, 1178.7] },
  "55565KBO": { ra: [255, 0], dec: [35, 0], w: [0, 975.169] },
  "532037TNO": { ra: [130, 0], dec: [-10, 0], w: [0, 864] },
  "174567Varda": { ra: [20, 0], dec: [55, 0], w: [0, 62.6] },
  "90568KBO": { ra: [185, 0], dec: [-60, 0], w: [0, 1474.4] },
  "145452KBO": { ra: [310, 0], dec: [10, 0], w: [0, 1243.165] },
  "20000Varuna": { ra: [60, 0], dec: [30, 0], w: [0, 1361.99] },
  "2010KZ39KBO": { ra: [225, 0], dec: [-25, 0], w: [0, 960] },
  "55637KBO": { ra: [110, 0], dec: [45, 0], w: [0, 600.751] },
  "2018VG18TNO": { ra: [345, 0], dec: [-40, 0], w: [0, 1080] },
  Glkunllhomdima: { ra: [170, 0], dec: [20, 0], w: [0, 782] },
  "2014UZ224TNO": { ra: [35, 0], dec: [-15, 0], w: [0, 720] },
  "523794TNO": { ra: [270, 0], dec: [65, 0], w: [0, 664.6] },
  "28978Ixion": { ra: [145, 0], dec: [-30, 0], w: [0, 696.774] },
  "84922KBO": { ra: [205, 0], dec: [40, 0], w: [0, 1164.808467] },
  "278361KBO": { ra: [320, 0], dec: [-20, 0], w: [0, 1430.463576] },
  "2014WP50KBO": { ra: [55, 0], dec: [25, 0], w: [0, 909.473684] },
  "19521Chaos": { ra: [240, 0], dec: [-50, 0], w: [0, 785.454545] },
  "512381TNO": { ra: [100, 0], dec: [15, 0], w: [0, 617.142857] },
  "2014YA50KBO": { ra: [15, 0], dec: [-30, 0], w: [0, 1016.470588] },
  "2010FX86KBO": { ra: [280, 0], dec: [50, 0], w: [0, 546.835443] },
  "78799KBO": { ra: [165, 0], dec: [-15, 0], w: [0, 822.857143] },
  "455502KBO": { ra: [70, 0], dec: [-60, 0], w: [0, 2092.009685] },
  "612533KBO": { ra: [335, 0], dec: [35, 0], w: [0, 691.2] },
  "2017OF69KBO": { ra: [125, 0], dec: [55, 0], w: [0, 1152.0] },
  "470308KBO": { ra: [215, 0], dec: [-35, 0], w: [0, 664.615385] },
  "470443KBO": { ra: [30, 0], dec: [10, 0], w: [0, 960.0] },
  "559182KBO": { ra: [190, 0], dec: [45, 0], w: [0, 751.304348] },
  "523645KBO": { ra: [300, 0], dec: [-10, 0], w: [0, 1138.339921] },
  "523750KBO": { ra: [85, 0], dec: [-45, 0], w: [0, 1080.0] },
  "120348KBO": { ra: [255, 0], dec: [20, 0], w: [0, 738.461538] },
  "523681KBO": { ra: [150, 0], dec: [30, 0], w: [0, 864.0] },
  "202421KBO": { ra: [45, 0], dec: [-25, 0], w: [0, 1229.018492] },
  "482824KBO": { ra: [345, 0], dec: [60, 0], w: [0, 720.0] },
  "440030KBO": { ra: [120, 0], dec: [-40, 0], w: [0, 939.130435] },
  "472271KBO": { ra: [205, 0], dec: [25, 0], w: [0, 838.834951] },
  "499514KBO": { ra: [40, 0], dec: [50, 0], w: [0, 1066.666667] },
  "35671KBO": { ra: [285, 0], dec: [-20, 0], w: [0, 977.375566] },
  "119951KBO": { ra: [165, 0], dec: [15, 0], w: [0, 785.454545] },
  "556068KBO": { ra: [75, 0], dec: [-55, 0], w: [0, 881.632653] },
  "2012VP113TNO": { ra: [330, 0], dec: [35, 0], w: [0, 640.0] },
  "84719KBO": { ra: [240, 0], dec: [10, 0], w: [0, 981.818182] },
  "578993KBO": { ra: [10, 0], dec: [-30, 0], w: [0, 855.445545] },
  "471288KBO": { ra: [150, 0], dec: [60, 0], w: [0, 1093.670886] },
  "469306KBO": { ra: [260, 0], dec: [-45, 0], w: [0, 1255.813953] },
  "38628Huya": { ra: [95, 0], dec: [20, 0], w: [0, 1284.758364] },
  "469372KBO": { ra: [315, 0], dec: [45, 0], w: [0, 680.314961] },
  "175113KBO": { ra: [180, 0], dec: [-15, 0], w: [0, 1028.571429] },
  "144897KBO": { ra: [55, 0], dec: [30, 0], w: [0, 1139.841689] },
  "10Hygiea": { ra: [310, 0], dec: [-30, 0], w: [0, 624.819207] },
  "624Hektor": { ra: [335, 0], dec: [-30, 0], w: [0, 1248.464706] },
  "87Sylvia": { ra: [95, 0], dec: [70, 0], w: [0, 1666.782094] },
  "52Europa": { ra: [255, 0], dec: [70, 0], w: [0, 1534.648418] },
  "2015QW23KBO": { ra: [120, 0], dec: [25, 0], w: [0, 960.0] },
  "556416KBO": { ra: [30, 0], dec: [-40, 0], w: [0, 864.0] },
  "15Eunomia": { ra: [5, 0], dec: [-65, 0], w: [0, 1420.3518] },
  "511Davida": { ra: [295, 0], dec: [30, 0], w: [0, 1684.210526] },
  "704Interamnia": { ra: [260, 0], dec: [-5, 0], w: [0, 991.69729] },
  "107Camilla": { ra: [70, 0], dec: [55, 0], w: [0, 1783.676756] },
  Nereid: { ra: [30, 0], dec: [50, 0], w: [0, 745.213041] },
  "15874TNO": { ra: [345, 0], dec: [-20, 0], w: [0, 720.0] },
  "10199Chariklo": { ra: [151.3, 0], dec: [41.48, 0], w: [0, 1233.580811] },
  "2015AH281Centaur": { ra: [215, 0], dec: [35, 0], w: [0, 1016.470588] },
  "15789KBO": { ra: [100, 0], dec: [-35, 0], w: [0, 909.473684] },
  "523643Centaur": { ra: [290, 0], dec: [15, 0], w: [0, 822.857143] },
  "3Juno": { ra: [105, 0], dec: [40, 0], w: [0, 1198.4136] },
  "Hiʻiaka": { ra: [285, 0], dec: [-10, 0], w: [0, 892.561983] },
  "65Cybele": { ra: [210, 0], dec: [-60, 0], w: [0, 1420.717781] },
  "1437Diomedes": { ra: [50, 0], dec: [-40, 0], w: [0, 352.79706] },
  "16Psyche": { ra: [30, 0], dec: [-5, 0], w: [0, 2059.129427] },
  "523695Centaur": { ra: [170, 0], dec: [50, 0], w: [0, 981.818182] },
  "48Doris": { ra: [120, 0], dec: [-50, 0], w: [0, 726.654643] },
  "216Kleopatra": { ra: [69, 0], dec: [42, 0], w: [0, 1604.372688] },
  "523727Centaur": { ra: [10, 0], dec: [-25, 0], w: [0, 929.032258] },
  "121Hermione": { ra: [212, 0], dec: [-37, 0], w: [0, 1556.5108] },
  "31Euphrosyne": { ra: [14, 0], dec: [29, 0], w: [0, 1562.501413] },
  "88Thisbe": { ra: [194, 0], dec: [12, 0], w: [0, 1430.15079] },
  "324Bamberga": { ra: [140, 0], dec: [-23, 0], w: [0, 293.577982] },
  "145453KBO": { ra: [263, 0], dec: [56, 0], w: [0, 1097.839898] },
  "309239Centaur": { ra: [240, 0], dec: [-30, 0], w: [0, 1200.0] },
  "7Iris": { ra: [79, 0], dec: [51, 0], w: [0, 1210.280153] },
  "41Daphne": { ra: [61, 0], dec: [-64, 0], w: [0, 1442.89035] },
  "22Kalliope": { ra: [64, 0], dec: [59, 0], w: [0, 2082.780898] },
  "451Patientia": { ra: [72, 0], dec: [-24, 0], w: [0, 888.249203] },
  "45Eugenia": { ra: [172, 0], dec: [-39, 0], w: [0, 1516.055448] },
  "95626Centaur": { ra: [87, 0], dec: [-10, 0], w: [0, 1489.655172] },
  "562274Centaur": { ra: [291, 0], dec: [-11, 0], w: [0, 664.615385] },
  "19Fortuna": { ra: [228, 0], dec: [-55, 0], w: [0, 1160.787315] },
  "94Aurora": { ra: [140, 0], dec: [16, 0], w: [0, 1195.65082] },
  "532Herculina": { ra: [2, 0], dec: [11, 0], w: [0, 918.666148] },
  "9Metis": { ra: [86, 0], dec: [62, 0], w: [0, 1701.063322] },
  Leleakuhonua: { ra: [182, 0], dec: [30, 0], w: [0, 919.148936] },
  "39Laetitia": { ra: [206, 0], dec: [12, 0], w: [0, 1681.510276] },
  "2060Chiron": { ra: [157, 0], dec: [-28, 0], w: [0, 1459.952687] },
  "13Egeria": { ra: [176, 0], dec: [54, 0], w: [0, 1226.112101] },
  "375Ursula": { ra: [137, 0], dec: [42, 0], w: [0, 511.272856] },
  "130Elektra": { ra: [40, 0], dec: [52, 0], w: [0, 1653.695176] },
  "53311Deucalion": { ra: [312, 0], dec: [-28, 0], w: [0, 981.818182] },
  "423Diotima": { ra: [144, 0], dec: [53, 0], w: [0, 1809.424084] },
  "54598Bienor": { ra: [142, 0], dec: [-49, 0], w: [0, 945.295405] },
  Himalia: { ra: [51, 0], dec: [26, 0], w: [0, 1110.2687] },
  "6Hebe": { ra: [220, 0], dec: [49, 0], w: [0, 1187.715884] },
  Galatea: { ra: [299.36, 0], dec: [43.43, 0] },
  "702Alauda": { ra: [241, 0], dec: [-12, 0], w: [0, 517.14231] },
  "316179Centaur": { ra: [53, 0], dec: [44, 0], w: [0, 822.857143] },
  "2013KY18Centaur": { ra: [215, 0], dec: [-14, 0], w: [0, 872.727273] },
  "334Chicago": { ra: [127, 0], dec: [23, 0], w: [0, 1173.753566] },
  "24Themis": { ra: [110, 0], dec: [65, 0], w: [0, 1031.741947] },
  "447178Centaur": { ra: [158, 0], dec: [-55, 0], w: [0, 890.721649] },
  "259Aletheia": { ra: [273, 0], dec: [-15, 0], w: [0, 1061.034017] },
  "5145Pholus": { ra: [51, 0], dec: [38, 0], w: [0, 865.731463] },
  "372Palma": { ra: [4, 0], dec: [-64, 0], w: [0, 1008.521069] },
  "128Nemesis": { ra: [284, 0], dec: [39, 0], w: [0, 221.922558] },
  "154Bertha": { ra: [305, 0], dec: [-18, 0], w: [0, 342.530923] },
  Eris: { ra: [36.17, 0], dec: [44.51, 0], w: [0, 22.805163] },
  Haumea: { ra: [285.1, 0], dec: [-10.6, 0], w: [0, 2206.704346] },
  Makemake: { ra: [325.9, 0], dec: [56.2, 0], w: [0, 378.505778] },
  Phobos: { ra: [317.67071657, -0.10844326], dec: [52.88627266, -0.06134706], swing: { node: [190.72646643, 15917.10818695], ra: [-1.78428399], dec: [-1.07516537] } },
  "1951Lick": { ra: [62, 0], dec: [38, 0], w: [0, 1629.696695] },
  "3753Cruithne": { ra: [214, 0], dec: [-47, 0], w: [0, 316.368789] },
  "52762Asteroid": { ra: [331, 0], dec: [21, 0], w: [0, 715.231788] },
  ArendRigaux: { ra: [118, 0], dec: [-28, 0], w: [0, -642.379182] },
  Deimos: { ra: [316.65705808, -0.10518014], dec: [53.50992033, -0.05979094], swing: { node: [121.46893664, 660.22803474], ra: [3.09217726], dec: [1.83936004] } },
};

/** ICRF (equatorial) to the scene: equatorial to ecliptic, then the scene's y up (x, z, −y). */
function equatorialToScene(x: number, y: number, z: number): THREE.Vector3 {
  const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return new THREE.Vector3(x, ze, -ye);
}

export function hasFrame(id: string): boolean {
  return id in ROTATIONS;
}

/**
 * The rotation taking a body's own frame into the scene, Julian years after J2000. toParent is
 * the scene direction from the body to its parent, for a body that faces it.
 */
export function bodyToScene(id: string, years: number, toParent: THREE.Vector3, target = new THREE.Matrix4()): THREE.Matrix4 {
  const r = ROTATIONS[id]!;
  const centuries = years / 100;
  let raDeg = r.ra[0] + r.ra[1] * centuries;
  let decDeg = r.dec[0] + r.dec[1] * centuries;
  if (r.swing) {
    const node = (r.swing.node[0] + r.swing.node[1] * centuries) * DEG;
    r.swing.ra.forEach((a, k) => (raDeg += a * Math.sin((k + 1) * node)));
    r.swing.dec.forEach((a, k) => (decDeg += a * Math.cos((k + 1) * node)));
  }
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  // In the ICRF: the pole, the ascending node of the body's equator (90° east of the pole's RA)
  // and the direction 90° on from the node along the equator.
  const pole = new THREE.Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  const p = equatorialToScene(pole.x, pole.y, pole.z);
  let m: THREE.Vector3;
  if (r.w) {
    const w = ((r.w[0] + r.w[1] * years * 365.25) % 360) * DEG;
    const node = new THREE.Vector3(-Math.sin(ra), Math.cos(ra), 0);
    const across = new THREE.Vector3().crossVectors(pole, node);
    const meridian = node.multiplyScalar(Math.cos(w)).addScaledVector(across, Math.sin(w));
    m = equatorialToScene(meridian.x, meridian.y, meridian.z);
  } else {
    // Longitude 0° towards the parent, in the plane of the equator.
    m = toParent.clone().addScaledVector(p, -toParent.dot(p)).normalize();
  }
  const east = new THREE.Vector3().crossVectors(p, m);
  return target.makeBasis(m, p, east.negate());
}
