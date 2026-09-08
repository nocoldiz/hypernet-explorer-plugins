/*:
 * @target MZ
 * @plugindesc Periodic Table Viewer v1.0.0 ,  asymmetric book layout, esoteric elements
 * @author Omni-Lex
 *
 * @command openPeriodicTable
 * @text Open Periodic Table
 * @desc Opens the periodic table book viewer
 *
 * @help
 * Left page: full periodic table grid (standard + lanthanides/actinides + esoteric)
 * Right page: selected element description
 * Navigate with arrow keys or click. Escape to close.
 * i18n: js/i18n/{lang}/elements.json
 */

(() => {
    'use strict';

    const pluginName = 'PeriodicTableSystem';

    // period: 1-7 = standard rows | 'lan' = lanthanides | 'act' = actinides | 'eso' = esoteric
    const ELEMENTS = [
        // Period 1
        { sym:'H',  z:1,   period:1, group:1,  cat:'nonmetal'       },
        { sym:'He', z:2,   period:1, group:18, cat:'nobleGas'       },
        // Period 2
        { sym:'Li', z:3,   period:2, group:1,  cat:'alkaliMetal'    },
        { sym:'Be', z:4,   period:2, group:2,  cat:'alkalineEarth'  },
        { sym:'B',  z:5,   period:2, group:13, cat:'metalloid'      },
        { sym:'C',  z:6,   period:2, group:14, cat:'nonmetal'       },
        { sym:'N',  z:7,   period:2, group:15, cat:'nonmetal'       },
        { sym:'O',  z:8,   period:2, group:16, cat:'nonmetal'       },
        { sym:'F',  z:9,   period:2, group:17, cat:'halogen'        },
        { sym:'Ne', z:10,  period:2, group:18, cat:'nobleGas'       },
        // Period 3
        { sym:'Na', z:11,  period:3, group:1,  cat:'alkaliMetal'    },
        { sym:'Mg', z:12,  period:3, group:2,  cat:'alkalineEarth'  },
        { sym:'Al', z:13,  period:3, group:13, cat:'postTransition' },
        { sym:'Si', z:14,  period:3, group:14, cat:'metalloid'      },
        { sym:'P',  z:15,  period:3, group:15, cat:'nonmetal'       },
        { sym:'S',  z:16,  period:3, group:16, cat:'nonmetal'       },
        { sym:'Cl', z:17,  period:3, group:17, cat:'halogen'        },
        { sym:'Ar', z:18,  period:3, group:18, cat:'nobleGas'       },
        // Period 4
        { sym:'K',  z:19,  period:4, group:1,  cat:'alkaliMetal'    },
        { sym:'Ca', z:20,  period:4, group:2,  cat:'alkalineEarth'  },
        { sym:'Sc', z:21,  period:4, group:3,  cat:'transitionMetal'},
        { sym:'Ti', z:22,  period:4, group:4,  cat:'transitionMetal'},
        { sym:'V',  z:23,  period:4, group:5,  cat:'transitionMetal'},
        { sym:'Cr', z:24,  period:4, group:6,  cat:'transitionMetal'},
        { sym:'Mn', z:25,  period:4, group:7,  cat:'transitionMetal'},
        { sym:'Fe', z:26,  period:4, group:8,  cat:'transitionMetal'},
        { sym:'Co', z:27,  period:4, group:9,  cat:'transitionMetal'},
        { sym:'Ni', z:28,  period:4, group:10, cat:'transitionMetal'},
        { sym:'Cu', z:29,  period:4, group:11, cat:'transitionMetal'},
        { sym:'Zn', z:30,  period:4, group:12, cat:'transitionMetal'},
        { sym:'Ga', z:31,  period:4, group:13, cat:'postTransition' },
        { sym:'Ge', z:32,  period:4, group:14, cat:'metalloid'      },
        { sym:'As', z:33,  period:4, group:15, cat:'metalloid'      },
        { sym:'Se', z:34,  period:4, group:16, cat:'nonmetal'       },
        { sym:'Br', z:35,  period:4, group:17, cat:'halogen'        },
        { sym:'Kr', z:36,  period:4, group:18, cat:'nobleGas'       },
        // Period 5
        { sym:'Rb', z:37,  period:5, group:1,  cat:'alkaliMetal'    },
        { sym:'Sr', z:38,  period:5, group:2,  cat:'alkalineEarth'  },
        { sym:'Y',  z:39,  period:5, group:3,  cat:'transitionMetal'},
        { sym:'Zr', z:40,  period:5, group:4,  cat:'transitionMetal'},
        { sym:'Nb', z:41,  period:5, group:5,  cat:'transitionMetal'},
        { sym:'Mo', z:42,  period:5, group:6,  cat:'transitionMetal'},
        { sym:'Tc', z:43,  period:5, group:7,  cat:'transitionMetal'},
        { sym:'Ru', z:44,  period:5, group:8,  cat:'transitionMetal'},
        { sym:'Rh', z:45,  period:5, group:9,  cat:'transitionMetal'},
        { sym:'Pd', z:46,  period:5, group:10, cat:'transitionMetal'},
        { sym:'Ag', z:47,  period:5, group:11, cat:'transitionMetal'},
        { sym:'Cd', z:48,  period:5, group:12, cat:'transitionMetal'},
        { sym:'In', z:49,  period:5, group:13, cat:'postTransition' },
        { sym:'Sn', z:50,  period:5, group:14, cat:'postTransition' },
        { sym:'Sb', z:51,  period:5, group:15, cat:'metalloid'      },
        { sym:'Te', z:52,  period:5, group:16, cat:'metalloid'      },
        { sym:'I',  z:53,  period:5, group:17, cat:'halogen'        },
        { sym:'Xe', z:54,  period:5, group:18, cat:'nobleGas'       },
        // Period 6
        { sym:'Cs', z:55,  period:6, group:1,  cat:'alkaliMetal'    },
        { sym:'Ba', z:56,  period:6, group:2,  cat:'alkalineEarth'  },
        { sym:'Hf', z:72,  period:6, group:4,  cat:'transitionMetal'},
        { sym:'Ta', z:73,  period:6, group:5,  cat:'transitionMetal'},
        { sym:'W',  z:74,  period:6, group:6,  cat:'transitionMetal'},
        { sym:'Re', z:75,  period:6, group:7,  cat:'transitionMetal'},
        { sym:'Os', z:76,  period:6, group:8,  cat:'transitionMetal'},
        { sym:'Ir', z:77,  period:6, group:9,  cat:'transitionMetal'},
        { sym:'Pt', z:78,  period:6, group:10, cat:'transitionMetal'},
        { sym:'Au', z:79,  period:6, group:11, cat:'transitionMetal'},
        { sym:'Hg', z:80,  period:6, group:12, cat:'transitionMetal'},
        { sym:'Tl', z:81,  period:6, group:13, cat:'postTransition' },
        { sym:'Pb', z:82,  period:6, group:14, cat:'postTransition' },
        { sym:'Bi', z:83,  period:6, group:15, cat:'postTransition' },
        { sym:'Po', z:84,  period:6, group:16, cat:'metalloid'      },
        { sym:'At', z:85,  period:6, group:17, cat:'halogen'        },
        { sym:'Rn', z:86,  period:6, group:18, cat:'nobleGas'       },
        // Period 7
        { sym:'Fr', z:87,  period:7, group:1,  cat:'alkaliMetal'    },
        { sym:'Ra', z:88,  period:7, group:2,  cat:'alkalineEarth'  },
        { sym:'Rf', z:104, period:7, group:4,  cat:'transitionMetal'},
        { sym:'Db', z:105, period:7, group:5,  cat:'transitionMetal'},
        { sym:'Sg', z:106, period:7, group:6,  cat:'transitionMetal'},
        { sym:'Bh', z:107, period:7, group:7,  cat:'transitionMetal'},
        { sym:'Hs', z:108, period:7, group:8,  cat:'transitionMetal'},
        { sym:'Mt', z:109, period:7, group:9,  cat:'transitionMetal'},
        { sym:'Ds', z:110, period:7, group:10, cat:'transitionMetal'},
        { sym:'Rg', z:111, period:7, group:11, cat:'transitionMetal'},
        { sym:'Cn', z:112, period:7, group:12, cat:'transitionMetal'},
        { sym:'Nh', z:113, period:7, group:13, cat:'postTransition' },
        { sym:'Fl', z:114, period:7, group:14, cat:'postTransition' },
        { sym:'Mc', z:115, period:7, group:15, cat:'postTransition' },
        { sym:'Lv', z:116, period:7, group:16, cat:'postTransition' },
        { sym:'Ts', z:117, period:7, group:17, cat:'halogen'        },
        { sym:'Og', z:118, period:7, group:18, cat:'nobleGas'       },
        // Lanthanides (group = position within row, 1-based from La)
        { sym:'La', z:57,  period:'lan', group:1,  cat:'lanthanide' },
        { sym:'Ce', z:58,  period:'lan', group:2,  cat:'lanthanide' },
        { sym:'Pr', z:59,  period:'lan', group:3,  cat:'lanthanide' },
        { sym:'Nd', z:60,  period:'lan', group:4,  cat:'lanthanide' },
        { sym:'Pm', z:61,  period:'lan', group:5,  cat:'lanthanide' },
        { sym:'Sm', z:62,  period:'lan', group:6,  cat:'lanthanide' },
        { sym:'Eu', z:63,  period:'lan', group:7,  cat:'lanthanide' },
        { sym:'Gd', z:64,  period:'lan', group:8,  cat:'lanthanide' },
        { sym:'Tb', z:65,  period:'lan', group:9,  cat:'lanthanide' },
        { sym:'Dy', z:66,  period:'lan', group:10, cat:'lanthanide' },
        { sym:'Ho', z:67,  period:'lan', group:11, cat:'lanthanide' },
        { sym:'Er', z:68,  period:'lan', group:12, cat:'lanthanide' },
        { sym:'Tm', z:69,  period:'lan', group:13, cat:'lanthanide' },
        { sym:'Yb', z:70,  period:'lan', group:14, cat:'lanthanide' },
        { sym:'Lu', z:71,  period:'lan', group:15, cat:'lanthanide' },
        // Actinides
        { sym:'Ac', z:89,  period:'act', group:1,  cat:'actinide'   },
        { sym:'Th', z:90,  period:'act', group:2,  cat:'actinide'   },
        { sym:'Pa', z:91,  period:'act', group:3,  cat:'actinide'   },
        { sym:'U',  z:92,  period:'act', group:4,  cat:'actinide'   },
        { sym:'Np', z:93,  period:'act', group:5,  cat:'actinide'   },
        { sym:'Pu', z:94,  period:'act', group:6,  cat:'actinide'   },
        { sym:'Am', z:95,  period:'act', group:7,  cat:'actinide'   },
        { sym:'Cm', z:96,  period:'act', group:8,  cat:'actinide'   },
        { sym:'Bk', z:97,  period:'act', group:9,  cat:'actinide'   },
        { sym:'Cf', z:98,  period:'act', group:10, cat:'actinide'   },
        { sym:'Es', z:99,  period:'act', group:11, cat:'actinide'   },
        { sym:'Fm', z:100, period:'act', group:12, cat:'actinide'   },
        { sym:'Md', z:101, period:'act', group:13, cat:'actinide'   },
        { sym:'No', z:102, period:'act', group:14, cat:'actinide'   },
        { sym:'Lr', z:103, period:'act', group:15, cat:'actinide'   },
        // Esoteric elements
        { sym:'My', z:119, period:'eso', group:1, cat:'esoteric', mass:'∞',    state:'mythical', year:'ancient',      origin:'dwarvishMountains'  },
        { sym:'Ad', z:120, period:'eso', group:2, cat:'esoteric', mass:'∞',    state:'mythical', year:'primordial',   origin:'dragonBones'        },
        { sym:'Ae', z:121, period:'eso', group:3, cat:'esoteric', mass:'0',    state:'mythical', year:'eternal',      origin:'aetherPlane'    },
        { sym:'Vd', z:122, period:'eso', group:4, cat:'esoteric', mass:', ',    state:'mythical', year:'unknown',      origin:'voidBetween'    },
        { sym:'Sl', z:123, period:'eso', group:5, cat:'esoteric', mass:', ',    state:'mythical', year:'ancient',      origin:'soulCrystals'       },
        { sym:'Dc', z:124, period:'eso', group:6, cat:'esoteric', mass:'∞',    state:'mythical', year:'antediluvian', origin:'draconicCore'       },
        { sym:'Ma', z:125, period:'eso', group:7, cat:'esoteric', mass:'~1.7', state:'mythical', year:'arcaneAge',   origin:'leylineNexus'      },
        { sym:'Sh', z:126, period:'eso', group:8, cat:'esoteric', mass:'(?)',  state:'superposed', year:'unobserved', origin:'eventHorizon' },
    ];

    // --- Rendered-grid coordinates for vertical navigation ---------------
    // Map each element to the (row, col) position it actually occupies in the
    // rendered layout (see _buildTableHTML). Standard periods 1-7 map row=period,
    // col=group. Lanthanides/actinides are drawn on their own rows offset by two
    // cells. Esoterics are packed left-to-right on the bottom row.
    // Escape i18n-sourced strings before innerHTML injection.
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const _ESO_LIST = ELEMENTS.filter(e => e.period === 'eso');
    const _elementCoord = (e) => {
        if (e.period === 'lan') return { row: 8, col: 2 + e.group };
        if (e.period === 'act') return { row: 9, col: 2 + e.group };
        if (e.period === 'eso') return { row: 10, col: 1 + _ESO_LIST.indexOf(e) };
        return { row: e.period, col: e.group };
    };
    // Precompute row -> [element indices] for fast vertical lookups.
    const _rowElements = {};
    ELEMENTS.forEach((e, idx) => {
        const r = _elementCoord(e).row;
        (_rowElements[r] || (_rowElements[r] = [])).push(idx);
    });

    const ELEM_PROPS = {
        H:  { mass:'1.008',   state:'gas',     year:1766,        disc:'Cavendish'          },
        He: { mass:'4.003',   state:'gas',     year:1895,        disc:'Ramsay'             },
        Li: { mass:'6.941',   state:'solid',   year:1817,        disc:'Arfwedson'          },
        Be: { mass:'9.012',   state:'solid',   year:1798,        disc:'Vauquelin'          },
        B:  { mass:'10.81',   state:'solid',   year:1808,        disc:'Davy'               },
        C:  { mass:'12.011',  state:'solid',   year:'ancient',   disc:''            },
        N:  { mass:'14.007',  state:'gas',     year:1772,        disc:'Rutherford'         },
        O:  { mass:'15.999',  state:'gas',     year:1774,        disc:'Priestley'          },
        F:  { mass:'18.998',  state:'gas',     year:1886,        disc:'Moissan'            },
        Ne: { mass:'20.180',  state:'gas',     year:1898,        disc:'Ramsay'             },
        Na: { mass:'22.990',  state:'solid',   year:1807,        disc:'Davy'               },
        Mg: { mass:'24.305',  state:'solid',   year:1755,        disc:'Black'              },
        Al: { mass:'26.982',  state:'solid',   year:1825,        disc:'Ørsted'             },
        Si: { mass:'28.086',  state:'solid',   year:1824,        disc:'Berzelius'          },
        P:  { mass:'30.974',  state:'solid',   year:1669,        disc:'Brand'              },
        S:  { mass:'32.06',   state:'solid',   year:'ancient',   disc:''            },
        Cl: { mass:'35.45',   state:'gas',     year:1774,        disc:'Scheele'            },
        Ar: { mass:'39.948',  state:'gas',     year:1894,        disc:'Rayleigh'           },
        K:  { mass:'39.098',  state:'solid',   year:1807,        disc:'Davy'               },
        Ca: { mass:'40.078',  state:'solid',   year:1808,        disc:'Davy'               },
        Sc: { mass:'44.956',  state:'solid',   year:1879,        disc:'Nilson'             },
        Ti: { mass:'47.867',  state:'solid',   year:1791,        disc:'Gregor'             },
        V:  { mass:'50.942',  state:'solid',   year:1801,        disc:'del Río'            },
        Cr: { mass:'51.996',  state:'solid',   year:1798,        disc:'Vauquelin'          },
        Mn: { mass:'54.938',  state:'solid',   year:1774,        disc:'Gahn'               },
        Fe: { mass:'55.845',  state:'solid',   year:'ancient',   disc:''            },
        Co: { mass:'58.933',  state:'solid',   year:1735,        disc:'Brandt'             },
        Ni: { mass:'58.693',  state:'solid',   year:1751,        disc:'Cronstedt'          },
        Cu: { mass:'63.546',  state:'solid',   year:'ancient',   disc:''            },
        Zn: { mass:'65.38',   state:'solid',   year:1746,        disc:'Marggraf'           },
        Ga: { mass:'69.723',  state:'solid',   year:1875,        disc:'Lecoq de Boisbaudran'},
        Ge: { mass:'72.630',  state:'solid',   year:1886,        disc:'Winkler'            },
        As: { mass:'74.922',  state:'solid',   year:'ancient',   disc:''            },
        Se: { mass:'78.971',  state:'solid',   year:1817,        disc:'Berzelius'          },
        Br: { mass:'79.904',  state:'liquid',  year:1826,        disc:'Balard'             },
        Kr: { mass:'83.798',  state:'gas',     year:1898,        disc:'Ramsay'             },
        Rb: { mass:'85.468',  state:'solid',   year:1861,        disc:'Bunsen'             },
        Sr: { mass:'87.62',   state:'solid',   year:1790,        disc:'Crawford'           },
        Y:  { mass:'88.906',  state:'solid',   year:1794,        disc:'Gadolin'            },
        Zr: { mass:'91.224',  state:'solid',   year:1789,        disc:'Klaproth'           },
        Nb: { mass:'92.906',  state:'solid',   year:1801,        disc:'Hatchett'           },
        Mo: { mass:'95.95',   state:'solid',   year:1778,        disc:'Scheele'            },
        Tc: { mass:'(98)',    state:'solid',   year:1937,        disc:'Perrier'            },
        Ru: { mass:'101.07',  state:'solid',   year:1844,        disc:'Klaus'              },
        Rh: { mass:'102.91',  state:'solid',   year:1803,        disc:'Wollaston'          },
        Pd: { mass:'106.42',  state:'solid',   year:1803,        disc:'Wollaston'          },
        Ag: { mass:'107.87',  state:'solid',   year:'ancient',   disc:''            },
        Cd: { mass:'112.41',  state:'solid',   year:1817,        disc:'Stromeyer'          },
        In: { mass:'114.82',  state:'solid',   year:1863,        disc:'Reich'              },
        Sn: { mass:'118.71',  state:'solid',   year:'ancient',   disc:''            },
        Sb: { mass:'121.76',  state:'solid',   year:'ancient',   disc:''            },
        Te: { mass:'127.60',  state:'solid',   year:1782,        disc:'von Reichenstein'   },
        I:  { mass:'126.90',  state:'solid',   year:1811,        disc:'Courtois'           },
        Xe: { mass:'131.29',  state:'gas',     year:1898,        disc:'Ramsay'             },
        Cs: { mass:'132.91',  state:'solid',   year:1860,        disc:'Bunsen'             },
        Ba: { mass:'137.33',  state:'solid',   year:1808,        disc:'Davy'               },
        Hf: { mass:'178.49',  state:'solid',   year:1923,        disc:'Coster'             },
        Ta: { mass:'180.95',  state:'solid',   year:1802,        disc:'Ekeberg'            },
        W:  { mass:'183.84',  state:'solid',   year:1783,        disc:'de Elhuyar'         },
        Re: { mass:'186.21',  state:'solid',   year:1925,        disc:'Noddack'            },
        Os: { mass:'190.23',  state:'solid',   year:1803,        disc:'Tennant'            },
        Ir: { mass:'192.22',  state:'solid',   year:1803,        disc:'Tennant'            },
        Pt: { mass:'195.08',  state:'solid',   year:1735,        disc:'de Ulloa'           },
        Au: { mass:'196.97',  state:'solid',   year:'ancient',   disc:''            },
        Hg: { mass:'200.59',  state:'liquid',  year:'ancient',   disc:''            },
        Tl: { mass:'204.38',  state:'solid',   year:1861,        disc:'Crookes'            },
        Pb: { mass:'207.2',   state:'solid',   year:'ancient',   disc:''            },
        Bi: { mass:'208.98',  state:'solid',   year:'ancient',   disc:''            },
        Po: { mass:'(209)',   state:'solid',   year:1898,        disc:'Curie'              },
        At: { mass:'(210)',   state:'solid',   year:1940,        disc:'Corson'             },
        Rn: { mass:'(222)',   state:'gas',     year:1900,        disc:'Dorn'               },
        Fr: { mass:'(223)',   state:'solid',   year:1939,        disc:'Perey'              },
        Ra: { mass:'(226)',   state:'solid',   year:1898,        disc:'Curie'              },
        Rf: { mass:'(267)',   state:'solid',   year:1969,        disc:'JINR / Berkeley'    },
        Db: { mass:'(268)',   state:'solid',   year:1970,        disc:'JINR'               },
        Sg: { mass:'(271)',   state:'solid',   year:1974,        disc:'GSI'                },
        Bh: { mass:'(272)',   state:'solid',   year:1981,        disc:'GSI'                },
        Hs: { mass:'(270)',   state:'solid',   year:1984,        disc:'GSI'                },
        Mt: { mass:'(278)',   state:'unknown', year:1982,        disc:'GSI'                },
        Ds: { mass:'(281)',   state:'unknown', year:1994,        disc:'GSI'                },
        Rg: { mass:'(282)',   state:'unknown', year:1994,        disc:'GSI'                },
        Cn: { mass:'(285)',   state:'unknown', year:1996,        disc:'GSI'                },
        Nh: { mass:'(286)',   state:'unknown', year:2004,        disc:'RIKEN'              },
        Fl: { mass:'(289)',   state:'unknown', year:1999,        disc:'JINR'               },
        Mc: { mass:'(290)',   state:'unknown', year:2003,        disc:'JINR'               },
        Lv: { mass:'(293)',   state:'unknown', year:2000,        disc:'JINR'               },
        Ts: { mass:'(294)',   state:'unknown', year:2010,        disc:'JINR'               },
        Og: { mass:'(294)',   state:'unknown', year:2002,        disc:'JINR'               },
        La: { mass:'138.91',  state:'solid',   year:1839,        disc:'Mosander'           },
        Ce: { mass:'140.12',  state:'solid',   year:1803,        disc:'Berzelius'          },
        Pr: { mass:'140.91',  state:'solid',   year:1885,        disc:'von Welsbach'       },
        Nd: { mass:'144.24',  state:'solid',   year:1885,        disc:'von Welsbach'       },
        Pm: { mass:'(145)',   state:'solid',   year:1945,        disc:'Marinsky'           },
        Sm: { mass:'150.36',  state:'solid',   year:1879,        disc:'Boisbaudran'        },
        Eu: { mass:'151.96',  state:'solid',   year:1901,        disc:'Demarçay'           },
        Gd: { mass:'157.25',  state:'solid',   year:1880,        disc:'de Marignac'        },
        Tb: { mass:'158.93',  state:'solid',   year:1843,        disc:'Mosander'           },
        Dy: { mass:'162.50',  state:'solid',   year:1886,        disc:'Boisbaudran'        },
        Ho: { mass:'164.93',  state:'solid',   year:1879,        disc:'Cleve'              },
        Er: { mass:'167.26',  state:'solid',   year:1843,        disc:'Mosander'           },
        Tm: { mass:'168.93',  state:'solid',   year:1879,        disc:'Cleve'              },
        Yb: { mass:'173.05',  state:'solid',   year:1878,        disc:'de Marignac'        },
        Lu: { mass:'174.97',  state:'solid',   year:1906,        disc:'Urbain'             },
        Ac: { mass:'(227)',   state:'solid',   year:1899,        disc:'Debierne'           },
        Th: { mass:'232.04',  state:'solid',   year:1829,        disc:'Berzelius'          },
        Pa: { mass:'231.04',  state:'solid',   year:1917,        disc:'Hahn'               },
        U:  { mass:'238.03',  state:'solid',   year:1789,        disc:'Klaproth'           },
        Np: { mass:'(237)',   state:'solid',   year:1940,        disc:'McMillan'           },
        Pu: { mass:'(244)',   state:'solid',   year:1940,        disc:'Seaborg'            },
        Am: { mass:'(243)',   state:'solid',   year:1944,        disc:'Seaborg'            },
        Cm: { mass:'(247)',   state:'solid',   year:1944,        disc:'Seaborg'            },
        Bk: { mass:'(247)',   state:'solid',   year:1949,        disc:'Seaborg'            },
        Cf: { mass:'(251)',   state:'solid',   year:1950,        disc:'Seaborg'            },
        Es: { mass:'(252)',   state:'solid',   year:1952,        disc:'Ghiorso'            },
        Fm: { mass:'(257)',   state:'unknown', year:1952,        disc:'Ghiorso'            },
        Md: { mass:'(258)',   state:'unknown', year:1955,        disc:'Ghiorso'            },
        No: { mass:'(259)',   state:'unknown', year:1958,        disc:'Ghiorso'            },
        Lr: { mass:'(266)',   state:'unknown', year:1961,        disc:'Ghiorso'            },
    };

    // Category colour is meaning, not decoration, so it is a ladder of tokens
    // exactly as item rarity is: every cell, swatch and tile carries a
    // .pt-cat-<category> class and the stylesheet inks it from --pt-ink /
    // --pt-fill / --pt-hover. No colour is written here.
    const CATEGORIES = [
        'alkaliMetal', 'alkalineEarth', 'transitionMetal', 'postTransition',
        'metalloid', 'nonmetal', 'halogen', 'nobleGas',
        'lanthanide', 'actinide', 'esoteric',
    ];


    // =========================================================================
    // Scene
    // =========================================================================
    class Scene_PeriodicTable extends Scene_Base {
        create() {
            super.create();

            this._selectedIdx = 0;
            this._selectedSym = ELEMENTS[0].sym;
            this._uiBuilt = false;
            this._prevSym = null;

            this._container = document.createElement('div');
            this._container.id = 'pt-container';
            this._container.className = 'ui-overlay pt-overlay';
            // Right-click closes the book. TouchInput (polled in _handleInput)
            // sees the mousedown on document, so only the native menu is killed.
            this._container.addEventListener('contextmenu', (event) => {
                event.preventDefault();
            });

            document.body.appendChild(this._container);
            this._refresh();
            setTimeout(() => {
                if (this._container) this._container.classList.add('pt-shown');
            }, 16);

            if (window.MinigameFun) window.MinigameFun.played('Chemistry');
        }

        terminate() {
            if (this._container) { this._container.remove(); this._container = null; }
            super.terminate();
        }

        selectElement(sym) {
            const idx = ELEMENTS.findIndex(e => e.sym === sym);
            if (idx >= 0) {
                this._selectedIdx = idx;
                this._selectedSym = sym;
                SoundManager.playCursor();
                this._refresh();
            }
        }

        _refresh() {
            if (!this._container) return;

            const el    = ELEMENTS[this._selectedIdx];
            const props = ELEM_PROPS[el.sym] || el;

            const entry  = T.obj('PeriodicTable.data')[el.sym] || {};
            const name   = entry.name || el.sym;
            const desc   = entry.desc || '';
            const catLbl = T('PeriodicTable.categories.' + el.cat);
            const state  = T('PeriodicTable.states.' + (props.state || el.state || 'unknown'));

            const ui = {
                title: T('PeriodicTable.ui.title'),
                back: T('PeriodicTable.ui.back'),
                lan: T('PeriodicTable.ui.lanthanides'),
                act: T('PeriodicTable.ui.actinides'),
                eso: T('PeriodicTable.ui.esotericSection'),
                pSym: T('PeriodicTable.ui.props.symbol'),
                pNum: T('PeriodicTable.ui.props.number'),
                pMass: T('PeriodicTable.ui.props.mass'),
                pCat: T('PeriodicTable.ui.props.category'),
                pState: T('PeriodicTable.ui.props.state'),
                pDisc: T('PeriodicTable.ui.props.discoveredBy'),
                pYear: T('PeriodicTable.ui.props.year'),
                pOrigin: T('PeriodicTable.ui.props.origin'),
                sProps: T('PeriodicTable.ui.sections.properties'),
                sDesc: T('PeriodicTable.ui.sections.description'),
                sLegend: T('PeriodicTable.ui.sections.legend'),
            };

            if (!this._uiBuilt) {
                this._container.innerHTML = `
                    <div class="book-spread pt-spread">
                        <!-- LEFT PAGE: table grid -->
                        <div class="left-page pt-left">
                            <div class="page-header-bar">
                                <div class="back-button focusable" onclick="SceneManager._scene.popScene()">${ui.back}</div>
                                <h2 class="title">${ui.title}</h2>
                            </div>
                            ${this._buildTableHTML(ui)}
                        </div>
                        <!-- RIGHT PAGE: element details -->
                        <div class="right-page pt-right"></div>
                    </div>
                `;

                this._container.querySelectorAll('[data-sym]').forEach(cell => {
                    cell.addEventListener('click', () => {
                        const sym = cell.getAttribute('data-sym');
                        if (sym) SceneManager._scene.selectElement(sym);
                    });
                });

                this._uiBuilt = true;
            }

            // Swap cell highlight: deselect previous, select current
            if (this._prevSym && this._prevSym !== this._selectedSym) {
                this._setCellSelected(this._prevSym, false);
            }
            this._setCellSelected(this._selectedSym, true);
            this._prevSym = this._selectedSym;

            // Update right page only
            const rightPage = this._container.querySelector('.right-page');
            if (rightPage) {
                rightPage.innerHTML = this._buildDetailHTML(el, props, name, desc, catLbl, state, ui);
            }
        }

        // Selection is one class. The gold hairline that marks it is written
        // once in the stylesheet, the same mark every list in the game wears.
        _setCellSelected(sym, selected) {
            const cell = this._container && this._container.querySelector(`[data-sym="${sym}"]`);
            if (!cell) return;
            cell.classList.toggle('pt-selected', !!selected);
            if (selected && cell.scrollIntoView) {
                cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }

        // The whole table is ONE 18-column grid: every row, the two rare-earth
        // rows and the esoteric row included, fills exactly eighteen tracks, so
        // the columns line up without a single pixel measurement in here. Empty
        // tracks are spacer spans; the stylesheet owns every size and colour.
        _buildTableHTML(ui) {
            // Build lookup map: "period_group" -> element
            const map = {};
            ELEMENTS.forEach(e => { map[`${e.period}_${e.group}`] = e; });

            const cell = (el) => `
                <div class="pt-cell focusable pt-cat-${el.cat}" data-sym="${el.sym}" tabindex="0">
                    <span class="pt-cell-z">${el.z}</span>
                    <span class="pt-cell-sym${el.sym.length > 2 ? ' pt-cell-sym--long' : ''}">${el.sym}</span>
                </div>`;

            const gap = (n = 1) => `<span class="pt-gap"></span>`.repeat(n);

            const placeholderCell = (label, cat) =>
                `<div class="pt-placeholder pt-cat-${cat}">${label}</div>`;

            let html = `<div class="pt-grid">`;

            // Standard periods 1-7
            for (let p = 1; p <= 7; p++) {
                for (let g = 1; g <= 18; g++) {
                    const e = map[`${p}_${g}`];
                    if (e) {
                        html += cell(e);
                    } else if (p === 6 && g === 3) {
                        html += placeholderCell('*', 'lanthanide');
                    } else if (p === 7 && g === 3) {
                        html += placeholderCell('**', 'actinide');
                    } else {
                        html += gap();
                    }
                }
            }

            // Separator label, full width of the grid
            html += `<div class="pt-sep-label">* ${_esc(ui.lan)} &nbsp;&nbsp; ** ${_esc(ui.act)}</div>`;

            // Lanthanide and actinide rows, each offset by the two group columns
            // they hang below, then padded back out to eighteen tracks.
            ['lan', 'act'].forEach(kind => {
                html += gap(2);
                for (let i = 1; i <= 15; i++) {
                    const e = map[`${kind}_${i}`];
                    html += e ? cell(e) : gap();
                }
                html += gap();
            });

            // Esoteric section, its own heading and row inside the same grid
            html += `<div class="inspect-section-title pt-row-title">${_esc(ui.eso)}</div>`;
            const eso = ELEMENTS.filter(e => e.period === 'eso');
            eso.forEach(e => { html += cell(e); });
            html += gap(18 - eso.length);

            html += `</div>`;

            // Legend
            html += this._buildLegend(ui);

            return html;
        }

        _buildLegend(ui) {
            const items = CATEGORIES.map(cat => `
                <div class="pt-legend-item pt-cat-${cat}">
                    <span class="pt-legend-swatch"></span>
                    <span>${_esc(T('PeriodicTable.categories.' + cat))}</span>
                </div>`).join('');
            return `
                <div class="ui-section pt-legend-section">
                    <div class="inspect-section-title">${_esc(ui.sLegend)}</div>
                    <div class="pt-legend">${items}</div>
                </div>`;
        }

        _buildDetailHTML(el, props, name, desc, catLbl, stateLbl, ui) {
            const isEso = el.period === 'eso';
            const mass  = props.mass  || el.mass  || '?';
            const rawYear = props.year || el.year || '?';
            const year  = T.obj('PeriodicTable.eras')[rawYear] || rawYear;
            const disc  = props.disc || T('PeriodicTable.unknownDiscoverer');
            const origin = T.obj('PeriodicTable.origins')[el.origin] || el.origin || '?';

            // The head: the tile gives up its space to the reading, never the
            // other way round, so it is fixed and the body below it scrolls.
            const head = `
                <div class="ui-detail-head pt-sym-block pt-cat-${el.cat}">
                    <div class="pt-sym-tile">
                        <span class="pt-sym-z">${el.z}</span>
                        <span class="pt-sym-letters">${el.sym}</span>
                        <span class="pt-sym-mass">${_esc(mass)}</span>
                    </div>
                    <div class="ui-detail-titles">
                        <div class="pt-name">${_esc(name)}</div>
                        <div class="pt-cat-label">${_esc(catLbl)}</div>
                    </div>
                </div>`;

            // Two columns of label/value rows, the fact grid the backpack and
            // the character sheet already read in.
            const propRow = (label, val) => `
                <div class="inspect-spec-row">
                    <span class="inspect-spec-label">${_esc(label)}</span>
                    <span class="inspect-spec-value inspect-spec-value--wrap">${_esc(val)}</span>
                </div>`;

            const propsHTML = `
                <div class="inspect-section-title">${_esc(ui.sProps)}</div>
                <div class="inspect-spec-grid">
                    ${propRow(ui.pSym,   el.sym)}
                    ${propRow(ui.pNum,   el.z)}
                    ${propRow(ui.pMass,  mass)}
                    ${propRow(ui.pCat,   catLbl)}
                    ${propRow(ui.pState, stateLbl)}
                    ${isEso ? propRow(ui.pOrigin, origin) : propRow(ui.pDisc, disc)}
                    ${propRow(ui.pYear, year)}
                </div>`;

            const descHTML = desc ? `
                <div class="ui-section">
                    <div class="inspect-section-title">${_esc(ui.sDesc)}</div>
                    <p class="ui-prose">${_esc(desc)}</p>
                </div>` : '';

            return `
                <div class="ui-detail">
                    ${head}
                    <div class="ui-detail-scroll">${propsHTML}${descHTML}</div>
                </div>`;
        }

        update() {
            super.update();
            this._handleInput();
        }

        _handleInput() {
            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.popScene();
            } else if (Input.isRepeated('left')) {
                this._move(-1);
            } else if (Input.isRepeated('right')) {
                this._move(1);
            } else if (Input.isRepeated('up')) {
                this._moveVertical(-1);
            } else if (Input.isRepeated('down')) {
                this._moveVertical(1);
            }
        }

        _move(delta) {
            const len = ELEMENTS.length;
            this._selectAt(((this._selectedIdx + delta) % len + len) % len);
        }

        // Vertical navigation across the actual rendered grid. Scans rows in the
        // given direction (-1 up / +1 down) for the next populated row and lands
        // on the element in that row whose column is closest to the current one.
        _moveVertical(dir) {
            const cur = _elementCoord(ELEMENTS[this._selectedIdx]);
            for (let r = cur.row + dir; r >= 1 && r <= 10; r += dir) {
                const rowEls = _rowElements[r];
                if (rowEls && rowEls.length) {
                    let best = rowEls[0];
                    let bestDist = Infinity;
                    for (const idx of rowEls) {
                        const d = Math.abs(_elementCoord(ELEMENTS[idx]).col - cur.col);
                        if (d < bestDist) { bestDist = d; best = idx; }
                    }
                    this._selectAt(best);
                    return;
                }
            }
        }

        _selectAt(idx) {
            this._selectedIdx = idx;
            this._selectedSym = ELEMENTS[idx].sym;
            SoundManager.playCursor();
            this._refresh();
        }
    }

    window.Scene_PeriodicTable = Scene_PeriodicTable;

    PluginManager.registerCommand(pluginName, 'openPeriodicTable', () => {
        SceneManager.push(Scene_PeriodicTable);
    });
})();
