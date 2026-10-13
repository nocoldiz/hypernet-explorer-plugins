//=============================================================================
// VoxelWorldDecor.js
// VoxelWorld: 2D billboard vegetation, rocks, props and the settlement batcher
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - 2D billboard vegetation, rocks, props and the settlement batcher
 * @author Omni-Lex
 *
 * @help
 * 2D billboard vegetation, rocks, props and the settlement batcher.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldDecor.js'); return; }

    const {
        House, PLANT_CROPS, PLANT_POOL, ROCK_ASH, ROCK_POOL, SETTLE,
        SettlementBatch, TREE_POOLS, blockMaterial, getRenderType, loadTex, loadVoxelTex,
        planBaseY, planForTile, planSettlement, sampleBiomeAt,
        PROP_RADIUS, PROP_MIN_R, VoxelWorldState, WORLD_TILE_SIZE,
        // The field's own answers about water and about the rare islands out in
        // the open ocean. `profileFor` says whether a biome IS water as against
        // merely having some on it: the open sea and a lake are, a river square
        // is a field with a channel through it.
        SEA_LEVEL, oceanIslandOf, profileFor
    } = VW;

    // =========================================================================
    // ProceduralDecorator
    // High-performance instanced chunk decorations (Cities, Forests, Deserts)
    // =========================================================================
    // Drawn from their own hand-picked lists just above, so the biome map must
    // not scatter them a second time.
    const SKIP_CURATED = new Set(['Trees', 'Plants', 'Rocks', 'Grass']);

    // How far into the ground a scatter billboard is planted, as a fraction of
    // its own height. Small: enough that no card's bottom edge can be caught
    // floating over the voxel it stands on, not so much that a short plant is
    // swallowed by it.
    const SPRITE_SINK = 0.035;

    // =========================================================================
    // The sea floor
    // =========================================================================
    // Water squares used to be left bare: nothing was scattered on them at all,
    // so diving off a beach put the party over an empty sand plain. The bed of
    // the sea is furnished from the same biomeFurniture list every other place
    // is (Ocean and SeaBed both name Underwater, Plants, Rocks and Water), and
    // the sprites go down exactly the way a wood does - one instanced mesh per
    // texture, standing on the voxel surface.
    //
    // Only the near ring is dressed. A weed on the bed is a thing you swim up
    // to and cannot see at all from the surface, so paying for it out at the
    // edge of the streamed world would be paying for nothing.
    const SEABED_FOLDERS = ['Underwater', 'Plants', 'Rocks', 'Water'];   // i18n-ignore  furniture folder ids
    // How far under the water line a point has to be before anything is planted
    // there: the surf itself is left clear, so nothing stands half out of the
    // water at the top of a beach.
    const SEABED_MIN_DEPTH = 10;

    // =========================================================================
    // What grows in the dark
    // =========================================================================
    // The passages were bare rock and a chest. Nothing else was ever scattered
    // down there, because the whole surface pass is skipped underground - and
    // it has to be, since a wood scattered over the roof of a cave is a wood
    // nobody can see and most of what a cave used to cost.
    //
    // So the caves get a scatter of their own, off the folders that suit them,
    // planted on the floor of an actual passage rather than on the ground a
    // hundred metres overhead. Two folders a square, picked by the square, the
    // same way the sea floor is dressed.
    const CAVE_FOLDERS = [
        // folder, how thick it lies, and whether it is something you walk into
        { folder: 'Mushrooms', density: 1.0, kind: 'plant' },   // i18n-ignore  furniture folder id
        { folder: 'Crystals',  density: 0.7, kind: 'rock'  },   // i18n-ignore  furniture folder id
        { folder: 'Rocks',     density: 0.9, kind: 'rock'  },   // i18n-ignore  furniture folder id
        { folder: 'Vines',     density: 0.5, kind: 'plant' },   // i18n-ignore  furniture folder id
        { folder: 'Terrain',   density: 0.6, kind: 'rock'  },   // i18n-ignore  furniture folder id
    ];
    // How many pieces a passage square carries. Deliberately modest: a cave is
    // the most expensive place in the world to draw, and a stand of mushrooms
    // round the corner reads better than a carpet of them everywhere.
    const CAVE_SCATTER_MIN = 6;
    const CAVE_SCATTER_VAR = 10;
    // How many tries it takes to find that many spots. Most of the rock down
    // there is rock, and a point with no passage under it plants nothing.
    const CAVE_SCATTER_TRIES = 4;

    // =========================================================================
    // The chests
    // =========================================================================
    // The same three chests the 2D procedural maps carry (RandomItemChest,
    // RandomArmorChest, RandomWeaponChest - see ProceduralMapBiomeGenerator's
    // placeChestEvents), standing in the 3D world as billboards and paying out
    // of the same RandomLootSystem. One art file each, so a chest reads as what
    // it holds before it is opened.
    //
    // `cmd` is the RandomLootSystem plugin command that fills it. The kind is
    // read back off the sprite name when one is opened, so nothing about a
    // chest has to be stored anywhere: which square it is on, which of the
    // three it is and whether it has been emptied are all answered by the world
    // (VoxelWorldState's felled set, which is what a chest being gone is).
    const CHEST_FOLDER = 'Storage/Chests';   // i18n-ignore  furniture folder id
    const CHESTS = [
        { sprite: 'wooden_treasure_chest.png', cmd: 'getItem',   kind: 'item' },    // i18n-ignore  asset name
        { sprite: 'blue_treasure_chest.png',   cmd: 'getArmor',  kind: 'armor' },   // i18n-ignore  asset name
        { sprite: 'gold_treasure_chest.png',   cmd: 'getWeapon', kind: 'weapon' }   // i18n-ignore  asset name
    ];
    const CHEST_SIZE = 9;
    // Odds a square carries one, mirroring the 2D generator's own numbers so a
    // chest is exactly as rare out here as it is on the map: a find in open
    // country, something you expect once you are under the ground.
    const CHEST_SURFACE_CHANCE = 0.03;
    const CHEST_RUIN_CHANCE    = 0.22;
    const CHEST_CAVE_CHANCE    = 0.30;
    // How many a cave square may hold at once, and how far apart they are put.
    const CHEST_CAVE_MAX = 2;

    // Which of the three a square's chest is, and its sprite.
    function chestFor(roll) {
        return CHESTS[Math.min(CHESTS.length - 1, Math.floor(roll * CHESTS.length))];
    }

    // The chest a scattered prop is, off the sprite it was drawn with. Null for
    // anything that is not one, which is every other prop in the world.
    function chestKindOf(rec) {
        if (!rec || rec.kind !== 'chest') return null;
        return CHESTS.find(c => c.sprite === rec.name) || CHESTS[0];
    }


    // The furniture art now lives at img/furniture/<Category>/<Subcategory>/, so
    // the folder a sprite pool names ("Trees") is only half the path, and stage 6b
    // moved some pieces to another category outright (speckled_stone_arch is filed
    // under Buildings/Arches now). window.Items.FurnitureImageFolders maps a sprite
    // id to its real relative folder, which survives both changes; the pool's own
    // folder stays the fallback for art the index has not been rebuilt for.
    function furnitureSpritePath(folder, name) {
        const id = String(name).replace(/\.png$/i, ''); // i18n-ignore: asset path
        const index = (window.Items && window.Items.FurnitureImageFolders) || null;
        const real = (index && index[id]) || folder;
        return 'img/furniture/' + real + '/' + id + '.png'; // i18n-ignore: asset path
    }

    class ProceduralDecorator {
        constructor(matCache) {
            this.matCache = matCache;
            this.geos = {
                trunk: new THREE.CylinderGeometry(1.5, 2, 12, 5),
                leafBase: new THREE.DodecahedronGeometry(9),
                pineBase: new THREE.ConeGeometry(7, 20, 5),
                cactus: new THREE.CylinderGeometry(1.2, 1.2, 14, 5),
                rock: new THREE.DodecahedronGeometry(4),
                skyscraper: new THREE.BoxGeometry(20, 70, 20),
                houseBase: new THREE.BoxGeometry(14, 12, 14),
                houseRoof: new THREE.ConeGeometry(12, 9, 4).rotateY(Math.PI / 4),
                palmTrunk: new THREE.CylinderGeometry(0.8, 1.4, 20, 5),
                palmCrown: new THREE.ConeGeometry(9, 5, 6),
                bamboo:    new THREE.CylinderGeometry(0.5, 0.6, 26, 5),
                crystal:   new THREE.ConeGeometry(2.5, 12, 5),
                mushStem:  new THREE.CylinderGeometry(1.5, 2.2, 8, 6),
                mushCap:   new THREE.ConeGeometry(7, 4.5, 8),
                deadTrunk: new THREE.CylinderGeometry(1, 1.6, 16, 5),
                acaciaTop: new THREE.ConeGeometry(11, 3.5, 6),
                tomb:      new THREE.BoxGeometry(3, 5, 1),
                column:    new THREE.CylinderGeometry(2, 2.4, 13, 6),
                spire:     new THREE.ConeGeometry(4, 18, 5),
                // --- Docks structure pieces (positioned explicitly at build time) ---
                dockDeck:    new THREE.BoxGeometry(16, 2, 150),
                dockPiling:  new THREE.CylinderGeometry(1.2, 1.2, 26, 6),
                dockBollard: new THREE.CylinderGeometry(1.3, 1.6, 4, 8),
                crate:       new THREE.BoxGeometry(6, 6, 6),
                barrel:      new THREE.CylinderGeometry(2.2, 2.2, 5.5, 10),
                craneBase:   new THREE.BoxGeometry(7, 4, 7),
                craneMast:   new THREE.BoxGeometry(2.4, 32, 2.4),
                craneArm:    new THREE.BoxGeometry(2.2, 2.2, 28),
                craneCable:  new THREE.CylinderGeometry(0.25, 0.25, 14, 4),
                boatHull:    new THREE.BoxGeometry(7, 5, 22),
                boatCabin:   new THREE.BoxGeometry(5, 4, 7),
                lhBase:      new THREE.CylinderGeometry(4, 5.5, 24, 12),
                lhRoom:      new THREE.CylinderGeometry(3.2, 3.2, 5, 12),
                lhRoof:      new THREE.ConeGeometry(4.2, 5, 12),
                dockShed:    new THREE.BoxGeometry(22, 13, 16),
                // --- Gas station pieces (positioned explicitly at build time) ---
                gasCanopy:   new THREE.BoxGeometry(46, 3, 24),
                gasPillar:   new THREE.CylinderGeometry(1.2, 1.2, 16, 6),
                gasPump:     new THREE.BoxGeometry(4, 8, 5),
                gasSign:     new THREE.BoxGeometry(9, 6, 1),
                // --- unit shapes, scaled per instance (the whole of a town) ---
                // Each is one unit across and pivoted on its base, so a single
                // geometry serves a tower, a kerb, a bench and a bin alike.
                uBox: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
                uPyr: new THREE.CylinderGeometry(0, 0.707, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
                uCyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
                uSph: new THREE.SphereGeometry(0.5, 8, 6).translate(0, 0.5, 0)
                // (A pitched roof is not one of these: it is welded with the
                // building it belongs to, see House.Mesher.prism.)
            };

            // Adjust origins so they sit flat on the ground
            this.geos.trunk.translate(0, 6, 0);
            this.geos.leafBase.translate(0, 14, 0);
            this.geos.pineBase.translate(0, 10, 0);
            this.geos.cactus.translate(0, 7, 0);
            this.geos.rock.translate(0, 1.5, 0);
            this.geos.skyscraper.translate(0, 35, 0);
            this.geos.houseBase.translate(0, 7, 0);
            this.geos.houseRoof.translate(0, 17.5, 0);
            this.geos.palmTrunk.translate(0, 10, 0);
            this.geos.palmCrown.translate(0, 20, 0);
            this.geos.bamboo.translate(0, 13, 0);
            this.geos.crystal.translate(0, 6, 0);
            this.geos.mushStem.translate(0, 4, 0);
            this.geos.mushCap.translate(0, 9.5, 0);
            this.geos.deadTrunk.translate(0, 8, 0);
            this.geos.acaciaTop.translate(0, 13, 0);
            this.geos.tomb.translate(0, 2.5, 0);
            this.geos.column.translate(0, 6.5, 0);
            this.geos.spire.translate(0, 9, 0);

            // Billboard sprite quads (unit-sized, bottom-pivoted so they stand on
            // the ground). Aspect is baked per kind since the billboard shader only
            // applies one uniform scale. Trees are tall, rocks squat, plants square.
            //
            // The pivot sits a little BELOW the bottom edge (SPRITE_SINK), so the
            // foot of every card is buried rather than resting exactly on the
            // surface: the ground is voxels, a card is flat, and a trunk whose
            // last row of pixels lands on the seam reads as hovering over it from
            // anything but dead level. Sinking it plants the thing in the ground.
            const mkQuad = (w, h) =>
                new THREE.PlaneGeometry(w, h).translate(0, h * (0.5 - SPRITE_SINK), 0);
            this.spriteQuads = {
                tree:  mkQuad(0.85, 1.35),
                rock:  mkQuad(1.20, 0.85),
                plant: mkQuad(0.95, 0.95)
            };
            this._spriteTex = new Map();   // 'Folder/name.png' -> THREE.Texture
            // Every tile's instanced meshes point at these same shapes. A tile
            // streaming out frees its own meshes (Terrain's disposeTree), and
            // without this mark it freed the shared shapes too, so the next
            // tile in had to upload every one of them to the card again.
            for (const g of Object.values(this.geos)) if (g && g.userData) g.userData.vwShared = true;
            for (const g of Object.values(this.spriteQuads)) if (g && g.userData) g.userData.vwShared = true;

            // Windowed facades, off the block palette: a concrete-and-glass
            // sheet for a tower and a brick one for anything smaller, both with
            // the lit panes of an emissive sheet behind them so a town has
            // lights on after dark. They were canvases painted here in the
            // constructor - two of them, four texture uploads, every time a
            // decorator was made - and they are files now.
            this.skyscraperMat = blockMaterial('facade_concrete');
            this.houseMat = blockMaterial('facade_brick');
        }

        // -------------------------------------------------------------------
        // Roofs, shells, facades
        // -------------------------------------------------------------------
        // A building is not built here any more. Every wall, every roof and
        // every facade in the world comes out of VoxelWorldHouse.js, which is
        // the one place that knows where a wall goes - because when three
        // modules each had their own idea of that, the corners of every house
        // flickered and the windows came out whatever size the wall was.
        // See House.build.

        _seededRandom(x, y, i) {
            const h = Math.sin(x * 12.9898 + y * 78.233 + i * 13.54) * 43758.5453;
            return h - Math.floor(h);
        }

        // Instances a geometry at every transform in `instances`. `colorOrMat`
        // accepts either a colour hex (cached Lambert material) or a ready Material.
        _instance(grp, geo, colorOrMat, instances) {
            if (instances.length === 0) return;
            let mat;
            if (colorOrMat && colorOrMat.isMaterial) {
                mat = colorOrMat;
            } else {
                mat = this.matCache.get(colorOrMat);
                if (!mat) {
                    mat = new THREE.MeshLambertMaterial({ color: colorOrMat });
                    this.matCache.set(colorOrMat, mat);
                }
            }
            const dummy = new THREE.Object3D();
            const imesh = new THREE.InstancedMesh(geo, mat, instances.length);
            imesh.castShadow = false;        // decorations skip the shadow pass
            imesh.receiveShadow = true;
            instances.forEach((pos, i) => {
                dummy.position.set(pos.x, pos.y, pos.z);
                dummy.rotation.set(0, pos.rotY, 0);
                dummy.scale.setScalar(pos.scale);
                dummy.updateMatrix();
                imesh.setMatrixAt(i, dummy.matrix);
            });
            grp.add(imesh);
        }

        // Sparse palms along any land tile bordering water (coastline / beach).
        _decorateBeach(grp, wx, wy, tileSize, heightFn) {
            let nearWater = false;
            for (let dx = -1; dx <= 1 && !nearWater; dx++) {
                for (let dy = -1; dy <= 1 && !nearWater; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    if (getRenderType(sampleBiomeAt(wx + dx, wy + dy).name) === 'water') nearWater = true;
                }
            }
            if (!nearWater) return;

            const trunks = [], crowns = [];
            const palmCount = Math.floor(this._seededRandom(wx, wy, 91) * 3) + 1;   // 1..3, sparse
            for (let i = 0; i < palmCount; i++) {
                const lx = (this._seededRandom(wx, wy, i * 5 + 101) - 0.5) * (tileSize * 0.9);
                const lz = (this._seededRandom(wx, wy, i * 5 + 102) - 0.5) * (tileSize * 0.9);
                if (Math.abs(lx) < 30 && Math.abs(lz) < 30) continue;   // keep the road corridor clear

                const gx = wx + 0.5 + lx / tileSize;
                const gz = wy + 0.5 + lz / tileSize;
                const yPos = heightFn ? heightFn(gx, gz) : 0;
                // Only on the dry sandy shelf, not out in the water or up on cliffs.
                if (yPos < -0.5 || yPos > 12) continue;

                const scale = 0.8 + this._seededRandom(wx, wy, i * 5 + 103) * 0.6;
                const rotY  = this._seededRandom(wx, wy, i * 5 + 104) * Math.PI * 2;
                trunks.push({ x: lx, y: yPos, z: lz, rotY, scale });
                crowns.push({ x: lx, y: yPos, z: lz, rotY, scale });
            }
            this._instance(grp, this.geos.palmTrunk, '#8a6d3b', trunks);
            this._instance(grp, this.geos.palmCrown, '#3cb043', crowns);
        }

        _mat(colorHex) {
            let m = this.matCache.get(colorHex);
            if (!m) { m = new THREE.MeshLambertMaterial({ color: colorHex }); this.matCache.set(colorHex, m); }
            return m;
        }

        // --- the materials a town is made of, shared by every town on the map --
        _cached(key, make) {
            let m = this.matCache.get(key);
            if (!m) { m = make(); this.matCache.set(key, m); }
            return m;
        }
        // -------------------------------------------------------------------
        // Surfaces
        // -------------------------------------------------------------------
        // Everything a settled square is drawn with is a BLOCK now: one entry
        // in the world's own palette (VoxelWorld.Blocks), one PNG built by
        // tools/build_voxel_blocks.js, one material shared by every square in
        // the world rather than one per decorator. That is most of what a town
        // used to cost: a bench, a fence, a haystack and a parked car were four
        // untextured boxes in four ad-hoc shades, each of them its own material
        // and therefore its own bucket in the batch and its own draw call.
        //
        // The names are kept because the whole suite calls them, but every one
        // of them is now a lookup into the one palette.
        // The repeat every one of these carries is how many times its picture
        // tiles across the SHAPE it lands on. Everything a settled square draws
        // through the batch is a scaled unit box - a road five hundred units
        // long, a pavement, a ploughed field - and a box has no UVs worth the
        // name, so a repeat of one would stretch a single copy of the tile over
        // the whole of it. (Walls and roofs are welded with real UVs and take
        // none of this; see House.Mesher.)
        _block(key, tint, rep) {
            const m = blockMaterial(key, tint, rep);
            return m || this._mat('#8f9298');
        }
        _matAsphalt()  { return this._block('asphalt', null, 6); }
        _matPavement() { return this._block('pavement', null, 8); }
        _matRoof()     { return this._block('roof_slate', null, 2); }
        _matRoofTile() { return this._block('roof_tile', null, 2); }
        _matRoofShop() { return this._block('roof_shop', null, 2); }
        _matStone()    { return this._block('stone', null, 2); }
        _matLawn()     { return this._block('grass', null, 8); }
        _matGlass()    { return this._block('glass'); }
        _matWater()    { return this._block('water', null, 4); }
        _matDirt()     { return this._block('dirt', null, 5); }
        _matSoil()     { return this._block('soil', null, 5); }
        _matHay()      { return this._block('hay'); }
        _matCrop(i)    { return this._block('crop', ['#7f9e3a', '#a8b23f', '#5f8c46'][(i || 0) % 3]); }
        _matFloor()    { return this._block('floor', null, 3); }
        _matPlaster()  { return this._block('plaster', null, 3); }
        _matRuinPlaster() { return this._block('plaster', '#7e7668', 3); }
        _matRuinRoof() { return this._block('roof_slate', '#6b5a48', 2); }
        _matDeadWood() { return this._block('deadwood'); }
        _matPaint()    { return this._block('paint'); }
        _matMetal()    { return this._block('metal'); }
        _matWood()     { return this._block('plank'); }
        _matBrick()    { return this._block('brick', null, 2); }
        _matCobble()   { return this._block('cobble', null, 2); }
        _matLeaf()     { return this._block('leaf'); }
        _matAwning()   { return this._block('awning'); }
        _getLampHeadMat() {
            return this._cached('__st_lamphead', () => new THREE.MeshLambertMaterial({
                color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 1.0
            }));
        }

        // A building's own facade is House.facadeFor: measured in window bays,
        // so a window is the same window whatever wall it lands on. The one
        // above is the dock shed's, which is a single stretched box and wants
        // to stay one.

        // A built harbour: a piled timber pier reaching out over the water, stacked
        // cargo, a gantry crane, a windowed warehouse, a lighthouse and moored boats.
        // The whole thing is assembled along +Z then rotated to face the open water.
        _decorateDocks(grp, wx, wy) {
            // Orient the pier toward the nearest water neighbour.
            let wdx = 0, wdy = 1, found = false;
            for (let dy = -1; dy <= 1 && !found; dy++) {
                for (let dx = -1; dx <= 1 && !found; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (getRenderType(sampleBiomeAt(wx + dx, wy + dy).name) === 'water') {
                        wdx = dx; wdy = dy; found = true;
                    }
                }
            }
            const len = Math.hypot(wdx, wdy) || 1;
            const dock = new THREE.Group();
            dock.rotation.y = Math.atan2(wdx / len, wdy / len);

            const add = (geoKey, colorHex, x, y, z, ry) => {
                const m = new THREE.Mesh(this.geos[geoKey], this._mat(colorHex));
                m.position.set(x, y, z);
                if (ry) m.rotation.y = ry;
                m.castShadow = false;
                m.receiveShadow = true;
                dock.add(m);
                return m;
            };

            const WOOD = '#6b4f33', POST = '#5a4228', STEEL = '#7d8794';
            const CRATE = '#9c7b4d', BARREL = '#3f6b4a', HULL = '#8c3b32';

            // Deck planking, top surface ~y=4, land end at z=-15.
            add('dockDeck', WOOD, 0, 3, 60);

            // Support pilings in pairs down the length of the pier.
            for (let z = 5; z <= 130; z += 30) {
                add('dockPiling', POST, -7, -11, z);
                add('dockPiling', POST,  7, -11, z);
            }

            // Mooring bollards along the seaward edges.
            [60, 95, 125].forEach(z => {
                add('dockBollard', '#2e2e2e', -9, 6, z);
                add('dockBollard', '#2e2e2e',  9, 6, z);
            });

            // Stacked cargo near the landward end.
            add('crate', CRATE, -4, 7, 12);
            add('crate', CRATE,  4, 7, 16, 0.4);
            add('crate', CRATE, -1, 13, 13);
            add('barrel', BARREL,  5, 6.75, 30);
            add('barrel', BARREL, -5, 6.75, 34);
            add('barrel', BARREL,  4, 6.75, 38);

            // Gantry crane reaching over the water.
            add('craneBase', STEEL, 6, 6, 5);
            add('craneMast', STEEL, 6, 20, 5);
            add('craneArm',  STEEL, 6, 35, 19);
            add('craneCable', '#222222', 6, 27, 32);

            // Windowed warehouse on the shore (reuses the lit-window facade).
            const shed = new THREE.Mesh(this.geos.dockShed, this.houseMat);
            shed.position.set(-16, 6.5, -6);
            shed.receiveShadow = true;
            dock.add(shed);

            // Lighthouse with a glowing lamp room.
            add('lhBase', '#f4f4f4', 18, 12, -12);
            add('lhRoom', '#202830', 18, 26.5, -12);
            const lamp = new THREE.Mesh(this.geos.lhRoom, this._emissiveMat('__lhlamp', '#ffd34d'));
            lamp.scale.set(0.7, 0.45, 0.7);
            lamp.position.set(18, 26.5, -12);
            dock.add(lamp);
            add('lhRoof', '#b22222', 18, 31, -12);

            // Moored boats riding on the water beside the far deck.
            const boat = (x, z, ry) => {
                add('boatHull',  HULL,    x, -1, z, ry);
                add('boatCabin', '#dfe3e6', x, 3.5, z - 2, ry);
            };
            boat(-14, 95, 0.08);
            boat( 14, 80, -0.05);

            grp.add(dock);
        }

        // A roadside fuel station for city / village tiles: a forecourt canopy on
        // four pillars, two fuel pumps, a little shop and a lit price sign. Tucked
        // into a tile corner so it never blocks the central road corridor.
        _decorateGasStation(grp, wx, wy, spot, y) {
            const st = new THREE.Group();
            const sx = spot ? spot.x : (this._seededRandom(wx, wy, 71) < 0.5 ? -1 : 1) * 78;
            const sz = spot ? spot.z : (this._seededRandom(wx, wy, 72) < 0.5 ? -1 : 1) * 78;
            st.position.set(sx, y || 0, sz);
            st.rotation.y = spot ? spot.rot : this._seededRandom(wx, wy, 73) * Math.PI * 2;

            const add = (geoKey, colorOrMat, x, y, z) => {
                const mat = (colorOrMat && colorOrMat.isMaterial) ? colorOrMat : this._mat(colorOrMat);
                const m = new THREE.Mesh(this.geos[geoKey], mat);
                m.position.set(x, y, z);
                m.castShadow = false; m.receiveShadow = true;
                st.add(m);
                return m;
            };

            // Forecourt canopy on four pillars.
            add('gasCanopy', '#e8e8ee', 0, 16, 0);
            for (const px of [-18, 18]) for (const pz of [-9, 9]) add('gasPillar', '#c0392b', px, 8, pz);
            // Two fuel pumps under the canopy.
            add('gasPump', '#b23b3b', -6, 4, 0);
            add('gasPump', '#2f6fb0',  6, 4, 0);
            // Shop building (reuses the lit-window facade) + a tall glowing sign.
            const shop = new THREE.Mesh(this.geos.dockShed, this.houseMat);
            shop.position.set(0, 6.5, -22); shop.receiveShadow = true; st.add(shop);
            add('gasPillar', '#8a8f99', 26, 11, 0);
            add('gasSign', this._emissiveMat('__gassign', '#ffcf3d'), 26, 20, 0);

            grp.add(st);
        }

        // An abandoned structure on an empty square: a farmhouse with its roof
        // in, a barn, a chapel, a watchtower, a factory with its chimney still
        // standing. Planned the way a town is (see planAbandoned) and built the
        // way a house is (see House.build), so its walls are solid, its inside
        // is walkable and its door is a door - it has just lost its roof and
        // half its wall runs.
        _decorateAbandoned(grp, wx, wy, heightFn) {
            const plan = planForTile(wx, wy);
            if (!plan || !plan.abandoned) return false;
            const lot = plan.lots[0];
            const baseY = planBaseY(plan, wx, wy, heightFn || (() => 0));
            const B = new SettlementBatch(this);
            const M = new House.Mesher();
            const stone = this._matStone();

            // A levelled patch of ground under it, deep enough to bridge the
            // fall of the land on the downhill side.
            B.add('uBox', this._matSoil(), lot.x, baseY - 7, lot.z, lot.w + 10, 7, lot.d + 10, 0);

            // What it was built out of is the PLAN's answer (see RUIN_SCHEMES):
            // a barn was boards, a factory dark brick and iron, a chapel
            // ashlar. It used to be one of two materials for the whole world.
            House.build(M, this, lot, baseY, { height: lot.h, ruinedRoof: true });

            for (const p of plan.props) {
                switch (p.kind) {
                    case 'rubble':
                        B.add('uSph', stone, p.x, baseY - p.size * 0.3, p.z,
                            p.size * 2, p.size, p.size * 1.7, p.rot);
                        break;
                    case 'deadtree':
                        B.add('uCyl', this._matDeadWood(), p.x, baseY, p.z, 2.4, 14, 2.4, 0);
                        B.add('uCyl', this._matDeadWood(), p.x + 3, baseY + 11, p.z, 7, 1.2, 1.2, 0);
                        break;
                    case 'fence':
                        B.add('uBox', this._matDeadWood(), p.x, baseY + 1.6, p.z,
                            p.rot ? 0.5 : p.len, 0.6, p.rot ? p.len : 0.5, 0);
                        break;
                    case 'chimney':
                        B.add('uBox', stone, p.x, baseY, p.z, 9, p.h, 9, 0);
                        break;
                }
            }
            B.flush(grp);
            M.flush(grp);
            return true;
        }

        // The farm or the cottage on an empty square, which used to be planned,
        // furnished and given collision without anybody ever building the
        // outside of it. House.buildSteading is that missing half; the yard
        // round it goes down through this decorator's own prop builder.
        _decorateSteading(grp, wx, wy, heightFn) {
            return House.buildSteading(this, grp, wx, wy, heightFn);
        }

        // One piece of the furniture a settled place is dressed with: a lamp,
        // a bench, a haystack, a field of crops, a run of fence. Every plan
        // that has props uses the same list, which is why it is one method and
        // not one copy per builder - a steading's well and a town square's well
        // are the same well.
        //
        //   baseY  the ground the square stands on
        //   PAVE   how far the pavement is raised above it (0 where there is
        //          no pavement: a village lane, a farmyard)
        //   big    a city, which paves its yards where a village turfs them
        _buildProp(B, p, baseY, PAVE, big) {
            const ROAD = SETTLE.roadH;
            switch (p.kind) {
                case 'lamp':
                    B.add('uCyl', this._block('pole'), p.x, baseY + PAVE, p.z, 1.1, 26, 1.1, 0);
                    B.add('uBox', this._getLampHeadMat(), p.x, baseY + PAVE + 25, p.z, 3.2, 1.4, 2, p.rot);
                    break;
                case 'tree':
                    B.add('uCyl', this._matWood(), p.x, baseY + PAVE, p.z, 2.2, 11, 2.2, 0);
                    B.add('uSph', this._matLeaf(), p.x, baseY + PAVE + 10, p.z, 13, 13, 13, 0);
                    break;
                case 'bench':
                    B.add('uBox', this._matWood(), p.x, baseY + PAVE + 2.2, p.z, 9, 0.8, 2.6, p.rot);
                    B.add('uBox', this._matWood(), p.x, baseY + PAVE, p.z, 8, 2.2, 0.8, p.rot);
                    break;
                case 'bin':
                    B.add('uCyl', this._block('iron'), p.x, baseY + PAVE, p.z, 2.4, 3.6, 2.4, 0);
                    break;
                case 'zebra':
                    for (let k = -2; k <= 2; k++) {
                        const ox = p.rot ? 0 : k * 3.4, oz = p.rot ? k * 3.4 : 0;
                        B.add('uBox', this._matPaint(), p.x + ox, baseY + ROAD, p.z + oz,
                            p.rot ? 7 : 2, 0.06, p.rot ? 2 : 7, 0);
                    }
                    break;
                case 'signal':
                    B.add('uCyl', this._block('pole'), p.x, baseY + PAVE, p.z, 1, 18, 1, 0);
                    B.add('uBox', this._emissiveMat('__signal', '#ff5a3c'), p.x,
                        baseY + PAVE + 17, p.z, 1.6, 4, 1.6, p.rot);
                    break;
                case 'car': {
                    const tint = ['#b23b3b', '#2f6fb0', '#e8e8ee', '#2d2d33', '#4a7d4a', '#c9a227'][p.tint % 6];
                    B.add('uBox', this._block('metal', tint), p.x, baseY + ROAD + 1.4, p.z, 7, 3, 15, p.rot);
                    B.add('uBox', this._matGlass(), p.x, baseY + ROAD + 4.2, p.z, 6, 2.6, 7.5, p.rot);
                    break;
                }
                case 'lawn':
                    B.add('uBox', this._matLawn(), p.x, baseY, p.z, p.w, PAVE + 0.1, p.d, 0);
                    break;
                case 'tarmac':
                    B.add('uBox', this._matAsphalt(), p.x, baseY, p.z, p.w, PAVE + 0.05, p.d, 0);
                    break;
                case 'yard':
                    B.add('uBox', big ? this._matPavement() : this._matLawn(),
                        p.x, baseY, p.z, p.w, PAVE + 0.12, p.d, 0);
                    break;
                case 'green':
                case 'garden':
                    B.add('uBox', this._matLawn(), p.x, baseY, p.z, p.w, 0.35, p.d, 0);
                    break;
                case 'fence':
                    B.add('uBox', this._matWood(), p.x, baseY + 1.4, p.z,
                        p.rot ? 0.5 : p.len, 0.6, p.rot ? p.len : 0.5, 0);
                    B.add('uBox', this._matWood(), p.x, baseY + 2.6, p.z,
                        p.rot ? 0.5 : p.len, 0.6, p.rot ? p.len : 0.5, 0);
                    break;
                case 'shed':
                    B.add('uBox', this._matCobble(), p.x, baseY - 0.6, p.z, 12, 1.2, 10, p.rot);
                    B.add('uBox', this._block('plank'), p.x, baseY, p.z, 11, 7, 9, p.rot);
                    B.add('uPyr', this._matRoofTile(), p.x, baseY + 7, p.z, 12, 4, 10, p.rot);
                    break;
                case 'well':
                    B.add('uCyl', this._matCobble(), p.x, baseY, p.z, 8, 4.5, 8, 0);
                    B.add('uCyl', this._matWood(), p.x - 3, baseY + 4.5, p.z, 0.8, 8, 0.8, 0);
                    B.add('uCyl', this._matWood(), p.x + 3, baseY + 4.5, p.z, 0.8, 8, 0.8, 0);
                    B.add('uPyr', this._matRoofTile(), p.x, baseY + 12, p.z, 11, 4, 11, 0);
                    break;
                case 'haystack':
                    B.add('uCyl', this._matHay(), p.x, baseY, p.z, 11, 9, 11, 0);
                    B.add('uPyr', this._matHay(), p.x, baseY + 9, p.z, 11, 5, 11, 0);
                    break;
                case 'field': {
                    B.add('uBox', this._matSoil(), p.x, baseY, p.z, p.w, 0.3, p.d, 0);
                    // Crop rows, drilled the way the field was ploughed.
                    const rows = 9;
                    const step = (p.rot ? p.w : p.d) / rows;
                    for (let k = 0; k < rows; k++) {
                        const o = -((p.rot ? p.w : p.d) / 2) + step * (k + 0.5);
                        B.add('uBox', this._matCrop(p.crop),
                            p.x + (p.rot ? o : 0), baseY + 0.3, p.z + (p.rot ? 0 : o),
                            p.rot ? 2.2 : p.w * 0.94, 3.2, p.rot ? p.d * 0.94 : 2.2, 0);
                    }
                    break;
                }
                case 'pond':
                    B.add('uCyl', this._matWater(), p.x, baseY - 0.4, p.z, p.w, 0.8, p.d, 0);
                    B.add('uBox', this._matSoil(), p.x, baseY - 0.6, p.z, p.w + 8, 0.6, p.d + 8, 0);
                    break;
                case 'fountain':
                    B.add('uCyl', this._block('marble'), p.x, baseY + PAVE, p.z, 16, 2.4, 16, 0);
                    B.add('uCyl', this._matWater(), p.x, baseY + PAVE + 2.4, p.z, 14, 0.4, 14, 0);
                    B.add('uCyl', this._block('marble'), p.x, baseY + PAVE + 2.4, p.z, 2.4, 7, 2.4, 0);
                    break;
            }
        }

        // A whole town, built from the plan (see planSettlement): a street grid
        // with pavements and kerbs, blocks of buildings that face their street,
        // courtyards and parks behind them, and the furniture that makes a street
        // a street. Everything is batched: one InstancedMesh per geometry and
        // material, so a dense town costs a dozen draw calls rather than a
        // thousand.
        _decorateSettlement(grp, wx, wy, big, heightFn) {
            // The world square, in world units. It used to read `this._ts`,
            // which NOTHING has ever set: every road, every pavement and every
            // street line of every town in the world was laid out against
            // undefined, and the whole plan came out NaN.
            const ts = WORLD_TILE_SIZE;
            // The plan the whole suite already agreed on, not a fresh one. This
            // used to re-plan the entire town - every street line, every block,
            // every lot on every block edge, every lamp and bench and parked
            // car along every pavement - from scratch, in the frame the square
            // streamed in, while planForTile was sitting on exactly that plan
            // for the walker, the crowd and the interiors. It is the single
            // biggest thing a town cost to arrive.
            const plan = planForTile(wx, wy) || planSettlement(wx, wy, big, ts);
            // A town stands on its own level ground: the square's own height,
            // read once at the middle, rather than the blended corner heights
            // (which dip toward any bordering water and would drown half a
            // coastal town's buildings under the sea).
            const baseY = heightFn ? heightFn(wx + 0.5, wy + 0.5) : 0;
            const S = SETTLE;
            const PAVE = plan.paveH;    // pavement top above the ground (0 in a village)
            const ROAD = S.roadH;       // carriageway top above the ground
            const roadMat = plan.roadMat === 'dirt' ? this._matDirt() : this._matAsphalt();

            // Two emitters: the street and its furniture are the same handful
            // of scaled unit shapes over and over, which is what an instanced
            // batch is for; the buildings are welded (see House.Mesher) because
            // their walls have to carry their own UVs.
            const B = new SettlementBatch(this);
            const M = new House.Mesher();

            // --- the roads, whichever way they run ---------------------------
            for (const r of plan.roads) {
                if (r.axis === 'h') B.add('uBox', roadMat, 0, baseY, r.c, ts, ROAD, r.w, 0);
                else                B.add('uBox', roadMat, r.c, baseY, 0, r.w, ROAD, ts, 0);
                if (!plan.markings) continue;
                // Broken centre line down the middle of a made-up carriageway.
                for (let t = -ts / 2 + 8; t < ts / 2; t += 26) {
                    if (r.axis === 'h') B.add('uBox', this._matPaint(), t, baseY + ROAD, r.c, 12, 0.06, 0.9, 0);
                    else                B.add('uBox', this._matPaint(), r.c, baseY + ROAD, t, 0.9, 0.06, 12, 0);
                }
            }

            // --- pavements: one raised slab per block, kerbs come for free ---
            const sw2 = S.streetW / 2;
            for (let bi = 0; bi < plan.nb; bi++) {
                for (let bj = 0; bj < plan.nb; bj++) {
                    const x0 = plan.lines[bi] + sw2, x1 = plan.lines[bi + 1] - sw2;
                    const z0 = plan.lines[bj] + sw2, z1 = plan.lines[bj + 1] - sw2;
                    B.add('uBox', this._matPavement(), (x0 + x1) / 2, baseY, (z0 + z1) / 2,
                        x1 - x0, PAVE, z1 - z0, 0);
                }
            }

            // --- buildings ---------------------------------------------------
            // One job in one place: House.build knows where a wall goes, what
            // roof sits on it and what facade it wears (see VoxelWorldHouse).
            // It welds its own geometry rather than instancing a unit cube,
            // because a wall's windows have to be measured in bays.
            for (const lot of plan.lots) House.build(M, this, lot, baseY + PAVE + 1.0, null);

            // --- street furniture --------------------------------------------
            for (const p of plan.props) this._buildProp(B, p, baseY, PAVE, big);

            // The filling station on its own forecourt (a town square is where
            // the camper refuels, see _atGasStation).
            this._decorateGasStation(grp, wx, wy, plan.station, baseY + PAVE);

            B.flush(grp);
            M.flush(grp);
        }

        _emissiveMat(key, colorHex) {
            let m = this.matCache.get(key);
            if (!m) {
                m = new THREE.MeshLambertMaterial({
                    color: colorHex, emissive: new THREE.Color(colorHex), emissiveIntensity: 1.0
                });
                this.matCache.set(key, m);
            }
            return m;
        }

        // --- 2D billboard sprites (trees / plants / rocks) ---------------------
        // Cached texture for one pool sprite, path resolved through the furniture
        // index (see furnitureSpritePath).
        //
        // These are the game's own pixel art, and they are drawn as pixel art:
        // NEAREST both ways and no mipmap chain, the same way the ground tiles
        // (loadVoxelTex) and the character sheets (characterSheetTexture) are
        // sampled. Left on the default LINEAR, a bush walked up to was smeared
        // into a blur the moment it filled more of the screen than the sprite
        // has pixels, and the mipmap chain had three resample a non-power-of-two
        // sheet on top of that.
        _loadFurnitureTex(folder, name) {
            const key = folder + '/' + name;
            let t = this._spriteTex.get(key);
            if (t) return t;
            t = new THREE.TextureLoader().load(furnitureSpritePath(folder, name));
            if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.generateMipmaps = false;
            t.anisotropy = 1;
            this._spriteTex.set(key, t);
            return t;
        }

        // A camera-facing billboard material. The stock lit shader is patched so the
        // per-instance position (from instanceMatrix) is placed in view space and the
        // quad corners are added there, so the sprite always faces the camera; its
        // normal is forced toward the camera so it still dims with the sun / night.
        _billboardMat(folder, name) {
            const ck = 'bb:' + folder + '/' + name;
            let m = this.matCache.get(ck);
            if (m) return m;
            m = new THREE.MeshLambertMaterial({
                map: this._loadFurnitureTex(folder, name),
                transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, depthWrite: true
            });
            m.onBeforeCompile = (shader) => {
                // i18n-ignore-start  GLSL shader source
                shader.vertexShader = shader.vertexShader
                    .replace('#include <project_vertex>', [
                        '#ifdef USE_INSTANCING',
                        '  vec3 bbCenter = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);',
                        '  float bbScale = length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z));',
                        '#else',
                        '  vec3 bbCenter = vec3(0.0); float bbScale = 1.0;',
                        '#endif',
                        'vec4 mvPosition = modelViewMatrix * vec4(bbCenter, 1.0);',
                        'mvPosition.xy += position.xy * bbScale;',
                        'gl_Position = projectionMatrix * mvPosition;'
                    ].join('\n'))
                    .replace('#include <defaultnormal_vertex>',
                        '#include <defaultnormal_vertex>\n\ttransformedNormal = vec3(0.0, 0.0, 1.0);');
                // i18n-ignore-end
            };
            m.customProgramCacheKey = () => 'camperBillboard';
            this.matCache.set(ck, m);
            return m;
        }

        // Scatters `items` as billboards, batched into one InstancedMesh per texture
        // (each tile deterministically draws from a small pool, so a stand of trees
        // reads as one or two draw calls). `quad` is the aspect-correct sprite quad.
        // `kind` is what the thing IS, for everything downstream: how wide it
        // stands (PROP_RADIUS), whether a vehicle goes through it or over it,
        // and which entry of the salvage table it answers to. Trees, rocks and
        // ground cover name themselves; everything else is a prop.
        _scatterBillboards(grp, folder, names, quad, items, size, wx, wy, seedBase, kind) {
            if (!items.length || !names.length) return;
            // Draw the whole tile's scatter from at most two textures (chosen per
            // tile) so a stand of trees is one or two InstancedMeshes, not dozens.
            const pick = (k) => names[Math.floor(this._seededRandom(wx, wy, seedBase + k) * names.length) % names.length];
            const nameA = pick(0), nameB = pick(1);
            const buckets = new Map();
            for (let i = 0; i < items.length; i++) {
                const name = (this._seededRandom(wx, wy, i * 5 + seedBase) < 0.5) ? nameA : nameB;
                let arr = buckets.get(name);
                if (!arr) { arr = []; buckets.set(name, arr); }
                arr.push(items[i]);
            }
            const dummy = new THREE.Object3D();
            // What the tile has standing on it, so a walker can be stopped by it,
            // a vehicle can knock it down and the party can take it apart. Kept
            // on the tile's own group, so it is disposed of with the chunk.
            const solid = kind ? (PROP_RADIUS[kind] || 0) : 0;
            if (!grp.userData.props) grp.userData.props = [];
            const props = grp.userData.props;
            const felled = VoxelWorldState;
            for (const [name, list] of buckets) {
                const im = new THREE.InstancedMesh(quad, this._billboardMat(folder, name), list.length);
                im.castShadow = false;
                im.receiveShadow = false;
                im.frustumCulled = false;
                for (let i = 0; i < list.length; i++) {
                    const p = list[i];
                    // Something already cut down stays cut down: it is drawn at
                    // nothing rather than skipped, so the instance indices still
                    // line up with the list.
                    const key = p.key ? (wx + ',' + wy + ':' + p.key) : null;
                    const gone = !!(key && felled && felled.isFelled(key));
                    dummy.position.set(p.x, p.y, p.z);
                    dummy.quaternion.set(0, 0, 0, 1);
                    dummy.scale.setScalar(gone ? 0 : size * (p.scale || 1));
                    dummy.updateMatrix();
                    im.setMatrixAt(i, dummy.matrix);
                    if (solid > 0 && !gone) {
                        props.push({
                            x: p.x, z: p.z, y: p.y,
                            r: Math.max(PROP_MIN_R, size * (p.scale || 1) * solid),
                            kind, key, folder, name, mesh: im, index: i,
                        });
                    }
                }
                grp.add(im);
            }
        }

        // Scatters one hand-picked category. A square draws its whole scatter
        // from ONE of the picked folders, chosen by the square itself, so a list
        // of forty sprites still costs a stand of trees rather than forty
        // instanced meshes, and the next square over reads differently.
        // `size` of 0 means "whatever a piece of that folder measures", read off
        // the furniture catalogue; `kind` of null means "a plant if the folder
        // is greenery, a prop otherwise".
        _scatterPicked(grp, groups, quad, items, wx, wy, seedBase, kind, size) {
            if (!groups.length || !items.length) return;
            const pick = Math.floor(this._seededRandom(wx, wy, seedBase + 7) * groups.length);
            const g = groups[Math.min(pick, groups.length - 1)];
            if (!g.sprites.length) return;
            const sz = size || BiomeFurniture.sizeOf(g.folder);
            const k  = kind || (PLANT_FOLDERS.test(g.folder) ? 'plant' : 'prop');
            this._scatterBillboards(grp, g.folder, g.sprites, quad, items, sz, wx, wy, seedBase, k);
        }

        // The props of a place: whatever the picker named for this biome, or
        // else the biome's own furniture folders. Naming props by hand replaces
        // the folder scatter outright, so a biome can be furnished with four
        // chosen things instead of whatever its folders happen to hold.
        _scatterFurniture(grp, wx, wy, biome, genItems, baseCount, skip, seedBase) {
            const picked = BiomeSprites.groups(biome.name, 'prop');
            if (!picked) return this._scatterBiomeFurniture(grp, wx, wy, biome, genItems, baseCount, skip);
            this._scatterPicked(grp, picked, this.spriteQuads.plant,
                genItems(Math.max(1, Math.round(baseCount * 0.5)), seedBase), wx, wy, seedBase, null, 0);
        }

        // Everything else that belongs out here: the signs and bins of a street,
        // the fences and barrels of a village, the graves of a boneyard, the
        // coral of a sea floor. Read off the biome's own list
        // (js/db/WorldGen/biomeFurniture.json) rather than written into this
        // file, so adding a folder of art is all it takes to see it in the
        // world.
        //
        // Only a FEW of a biome's folders are drawn on any one square, picked by
        // that square: a city has forty kinds of thing that could stand on it
        // and putting all forty on every block would be a scrapyard, while
        // picking three or four gives a street its own character and the next
        // street a different one. Each folder drawn is one instanced mesh.
        _scatterBiomeFurniture(grp, wx, wy, biome, genItems, baseCount, skip) {
            const list = BiomeFurniture.exterior(biome.name);
            if (!list.length) return;
            // Trees, plants and rocks are already scattered from their own
            // curated pools just above; drawing them twice would double a wood.
            const pool = list.filter(e => !skip.has(BiomeFurniture.categoryOf(e.folder)));
            if (!pool.length) return;

            const total = pool.reduce((sum, e) => sum + e.density, 0);
            if (total <= 0) return;
            const PICKS = 3;
            const chosen = new Map();
            for (let k = 0; k < PICKS; k++) {
                // Weighted by density, so what a place is mostly made of turns up
                // most often without ever being the only thing there.
                let r = this._seededRandom(wx, wy, 6100 + k) * total;
                for (const e of pool) {
                    r -= e.density;
                    if (r <= 0) { chosen.set(e.folder, e); break; }
                }
            }
            let seed = 6200;
            for (const e of chosen.values()) {
                const count = Math.max(1, Math.round(baseCount * e.density * 0.5));
                // Everything a biome is furnished with is a thing in the way
                // too: a barrel, a gravestone, a crate. Ground cover among them
                // stops nobody - PROP_RADIUS decides which is which.
                this._scatterBillboards(grp, e.folder, e.sprites, this.spriteQuads.plant,
                    genItems(count, seed), e.size, wx, wy, seed, PLANT_FOLDERS.test(e.folder) ? 'plant' : 'prop');
                seed += 40;
            }
        }

        // Which Trees pool (if any) suits a biome; null = no billboard trees.
        _treePoolFor(n) {
            if (/ice|snow|frost|tundra|glacier|arctic|permafrost/.test(n)) return TREE_POOLS.snow;
            if (/taiga|pine|spruce|conifer/.test(n))                       return TREE_POOLS.conifer;
            if (/tropical|jungle|mangrove|rainforest/.test(n))             return TREE_POOLS.jungle;
            if (/swamp|marsh|riverbank|bog|mire|landfill/.test(n))         return TREE_POOLS.dead;
            if (/graveyard|crypt|haunt|cursed|dead/.test(n))               return TREE_POOLS.dead;
            if (/sakura|cherry|fairy|blossom/.test(n))                     return TREE_POOLS.sakura;
            if (/savannah|steppe|highland|meadow|farm|fields|orchard/.test(n)) return TREE_POOLS.fruit;
            if (/forest|wood|park|grove/.test(n))                          return TREE_POOLS.broadleaf;
            return null;
        }

        // Which Plants pool (if any) to scatter as low ground cover.
        _plantPoolFor(n) {
            if (/farm|fields|meadow|crop|orchard|pasture/.test(n)) return PLANT_CROPS;
            if (/grass|forest|wood|park|grove|savannah|steppe|highland|swamp|marsh|jungle|tropical|fairy|plain|prairie|hills/.test(n))
                return PLANT_POOL;
            return null;
        }

        // Which Rocks pool (if any) to scatter; null = no rocks.
        _rockPoolFor(n) {
            if (/volcano|lava|magma|hell|ash|scorch|ember/.test(n)) return ROCK_ASH;
            if (/desert|badland|canyon|mesa|dune|saltflat|mountain|rock|rocky|highland|tundra|steppe|ruin|crystal|cave|quarry/.test(n))
                return ROCK_POOL;
            return null;
        }

        // Picks the 3D STRUCTURAL prop set for a biome (buildings and hard-surface
        // features only). Trees, plants and rocks are no longer 3D here - they are
        // scattered as 2D billboards in decorate(). Returns null when a biome has no
        // 3D structures (pure vegetation / rock biomes are handled by billboards).
        // Layers: { g: geometryKey, c: colourHex } (or mat: Material), optional
        // scale multiplier. `mix` alternates the two layers; `density` scales count.
        _archetypeFor(n) {
            // Built-up: dense towers (cities) or windowed houses with roofs.
            if (n.includes('city') || n.includes('metro') || n.includes('omegatower') || n.includes('spacecenter'))
                return { l1: { g: 'skyscraper', mat: this.skyscraperMat } };
            if (n.includes('burg') || n.includes('village') || n.includes('villa') || n.includes('houses') ||
                n.includes('town') || n.includes('factory') || n.includes('office') || n.includes('docks') ||
                n.includes('laboratory'))
                return { l1: { g: 'houseBase', mat: this.houseMat }, l2: { g: 'houseRoof', c: '#8b0000' } };

            // Volcanic / infernal: dark spires (rocks added as billboards).
            if (n.includes('volcano') || n.includes('lava') || n.includes('magma') || n.includes('hell'))
                return { l1: { g: 'spire', c: '#2a1818' }, density: 0.6 };

            if (n.includes('crystal'))
                return { l1: { g: 'crystal', c: '#00ced1' }, density: 0.7 };

            if (n.includes('mushroom') || n.includes('fungal') || n.includes('mycel'))
                return { l1: { g: 'mushStem', c: '#e8e0d0' }, l2: { g: 'mushCap', c: '#9370db' } };

            if (n.includes('bamboo'))
                return { l1: { g: 'bamboo', c: '#7d9a3f' } };

            // Tropical / wetland palms (shoreline palms are added separately).
            if (n.includes('tropical') || n.includes('jungle') || n.includes('mangrove'))
                return { l1: { g: 'palmTrunk', c: '#8a6d3b' }, l2: { g: 'palmCrown', c: '#3cb043' }, density: 0.6 };

            // Spooky: graveyards get tombstones; ruins/temples get broken columns.
            if (n.includes('graveyard') || n.includes('crypt') || n.includes('tomb') || n.includes('haunt'))
                return { l1: { g: 'tomb', c: '#9a9a9a' }, density: 0.7 };
            if (n.includes('ruin') || n.includes('temple') || n.includes('castle') || n.includes('ancient'))
                return { l1: { g: 'column', c: '#bdb76b' }, density: 0.7 };

            // Arid: cactus (rocks added as billboards).
            if (n.includes('desert') || n.includes('badland') || n.includes('canyon') ||
                n.includes('saltflat') || n.includes('dune') || n.includes('mesa'))
                return { l1: { g: 'cactus', c: '#2e8b57' }, density: 0.6 };

            return null;
        }

        // ---------------------------------------------------------------------
        // The sea floor, and the islands standing out of it
        // ---------------------------------------------------------------------
        // A water square gets two passes: the bed itself, dressed out of the
        // biome's own Underwater / Plants / Rocks folders, and - on the rare
        // squares that carry one (VoxelField.oceanIslandOf) - the dry land of
        // the island, with palms and rocks and a cottage on the big ones.
        _decorateWater(grp, wx, wy, biome, tileSize, heightFn, waterFn) {
            const isle = oceanIslandOf ? oceanIslandOf(wx, wy) : null;

            // The island first: it is what a diver surfaces next to.
            if (isle) this._decorateIsland(grp, wx, wy, isle, tileSize, heightFn);

            // Points across the square that are properly under water. The same
            // deterministic spread every other scatter uses, so a weed bed is
            // in the same place every time the square is streamed in.
            //
            // The water line is the one over THIS point, not sea level: a
            // mountain lake stands well above the sea and reeds have to know
            // where its own surface is, or nothing would ever be planted in one.
            const genItems = (count, seed) => {
                const out = [];
                for (let i = 0; i < count; i++) {
                    const lx = (this._seededRandom(wx, wy, i * 4 + seed)     - 0.5) * (tileSize * 0.94);
                    const lz = (this._seededRandom(wx, wy, i * 4 + seed + 1) - 0.5) * (tileSize * 0.94);
                    const gxu = (wx + 0.5) * tileSize + lx, gzu = (wy + 0.5) * tileSize + lz;
                    const yPos = heightFn ? heightFn(gxu / tileSize, gzu / tileSize) : 0;
                    const surf = waterFn ? waterFn(gxu, gzu) : SEA_LEVEL;
                    if (surf == null || yPos > surf - SEABED_MIN_DEPTH) continue;
                    const scale = 0.6 + this._seededRandom(wx, wy, i * 4 + seed + 2) * 0.9;
                    out.push({ x: lx, y: yPos, z: lz, rotY: 0, scale, key: seed + ':' + i });
                }
                return out;
            };

            // A hand-picked list for this biome wins, exactly as it does on
            // land; otherwise the biome's own furniture folders are used, and
            // the underwater ones out of them are the ones that matter.
            const picked = BiomeSprites.groups(biome.name, 'plant');
            if (picked) {
                this._scatterPicked(grp, picked, this.spriteQuads.plant,
                    genItems(14, 4100), wx, wy, 4100, 'plant', 0);
            } else {
                const list = BiomeFurniture.exterior(biome.name)
                    .filter(e => SEABED_FOLDERS.includes(BiomeFurniture.categoryOf(e.folder)));
                if (!list.length) return;
                // Two folders a square, weighted by density: a bed of one weed
                // with the odd rock in it reads as a sea floor; all four folders
                // on every square reads as an aquarium shop.
                const total = list.reduce((s, e) => s + e.density, 0) || 1;
                const chosen = new Map();
                for (let k = 0; k < 2; k++) {
                    let r = this._seededRandom(wx, wy, 4050 + k) * total;
                    for (const e of list) {
                        r -= e.density;
                        if (r <= 0) { chosen.set(e.folder, e); break; }
                    }
                }
                let seed = 4100;
                for (const e of chosen.values()) {
                    const count = 8 + Math.round(this._seededRandom(wx, wy, seed) * 14 * e.density);
                    this._scatterBillboards(grp, e.folder, e.sprites, this.spriteQuads.plant,
                        genItems(count, seed), e.size, wx, wy, seed, 'plant');
                    seed += 40;
                }
            }
        }

        // The dry land of a rare open-ocean island: palms and scrub on anything
        // big enough to hold them, rocks on the little ones, and on the biggest
        // - where somebody actually lives - the cottage the settlement planner
        // put there (planSteading handles the building itself; this is the
        // greenery round it).
        _decorateIsland(grp, wx, wy, isle, tileSize, heightFn) {
            // Somebody lives on the big ones (see planSteading's islandHouseAt):
            // a real cottage, with the same walls, door and furnished rooms a
            // house on a village street gets.
            this._decorateSteading(grp, wx, wy, heightFn);
            if (isle.size < 1) return;           // a bare rock stays a bare rock
            const cx = (wx + 0.5) * tileSize, cz = (wy + 0.5) * tileSize;
            const genItems = (count, seed) => {
                const out = [];
                for (let i = 0; i < count; i++) {
                    // Spread over the island's own disc rather than the square:
                    // an islet is a fraction of a square across, and scattering
                    // over the square would put every palm in the sea.
                    const a = this._seededRandom(wx, wy, i * 4 + seed) * Math.PI * 2;
                    const r = Math.sqrt(this._seededRandom(wx, wy, i * 4 + seed + 1)) * isle.r * 0.78;
                    const gxu = isle.cx + Math.cos(a) * r, gzu = isle.cz + Math.sin(a) * r;
                    const yPos = heightFn ? heightFn(gxu / tileSize, gzu / tileSize) : 0;
                    if (yPos < SEA_LEVEL + 3) continue;      // in the water, or on the beach
                    const scale = 0.7 + this._seededRandom(wx, wy, i * 4 + seed + 2) * 0.7;
                    out.push({ x: gxu - cx, y: yPos, z: gzu - cz, rotY: 0, scale,
                               key: seed + ':' + i });
                }
                return out;
            };
            const count = 3 + isle.size * 5;
            this._scatterBillboards(grp, 'Trees', TREE_POOLS.jungle, this.spriteQuads.tree,   // i18n-ignore  scatter group id
                genItems(count, 4400), 30, wx, wy, 4400, 'tree');
            this._scatterBillboards(grp, 'Rocks', ROCK_POOL, this.spriteQuads.rock,           // i18n-ignore  scatter group id
                genItems(Math.round(count * 0.6), 4500), 13, wx, wy, 4500, 'rock');
            this._scatterBillboards(grp, 'Plants', PLANT_POOL, this.spriteQuads.plant,        // i18n-ignore  scatter group id
                genItems(count, 4600), 11, wx, wy, 4600, 'plant');
        }

        // ---------------------------------------------------------------------
        // The chests
        // ---------------------------------------------------------------------
        // A square's chest, if it has one. Drawn as a billboard like everything
        // else out here, and therefore already a thing the party can walk into,
        // stand at and be prompted by; opening one is VoxelWorldScene's job
        // (_openChest), and a chest that has been emptied is remembered by the
        // world the same way a felled tree is.
        _scatterChests(grp, wx, wy, biome, tileSize, heightFn, ruined) {
            const n = (biome.name || '').toLowerCase();
            const water = getRenderType(biome.name) === 'water';
            if (water) return;
            const odds = ruined ? CHEST_RUIN_CHANCE
                : /cave|crypt|catacomb|barrow|dungeon|mine|ruin|temple|underdark|lair|oubliette/.test(n)
                    ? CHEST_CAVE_CHANCE : CHEST_SURFACE_CHANCE;
            if (this._seededRandom(wx, wy, 5901) >= odds) return;
            const C = chestFor(this._seededRandom(wx, wy, 5902));
            // Somewhere on the square that is dry land and off the road lane.
            const corridor = tileSize * 0.08;
            for (let attempt = 0; attempt < 8; attempt++) {
                const lx = (this._seededRandom(wx, wy, 5910 + attempt * 2)     - 0.5) * (tileSize * 0.8);
                const lz = (this._seededRandom(wx, wy, 5911 + attempt * 2) - 0.5) * (tileSize * 0.8);
                if (Math.abs(lx) < corridor && Math.abs(lz) < corridor) continue;
                const yPos = heightFn ? heightFn(wx + 0.5 + lx / tileSize, wy + 0.5 + lz / tileSize) : 0;
                if (yPos < SEA_LEVEL + 4) continue;
                this._scatterBillboards(grp, CHEST_FOLDER, [C.sprite], this.spriteQuads.plant,
                    [{ x: lx, y: yPos, z: lz, rotY: 0, scale: 1, key: 'chest' }],   // i18n-ignore  prop key
                    CHEST_SIZE, wx, wy, 5920, 'chest');
                return;
            }
        }

        // What is growing in the passages of a square: mushrooms, crystal, loose
        // rock, hanging vines. Put down on the floor of an actual passage rather
        // than on the surface a hundred metres over it, and only where there IS
        // a passage - most of the rock down there is rock.
        //
        //   floorFn(x, z)  the floor of the passage at a world point, or null
        _scatterCaveScenery(grp, wx, wy, tileSize, floorFn, biome) {
            if (!floorFn) return;
            // Two folders a square, weighted by how thickly each lies, so one
            // cave is a mushroom cave and the next one over is a crystal one.
            // A cave kind names a category; the square picks among the
            // subfolders of it the map knows (ore and formations are rocks).
            const pool = [];
            for (const e of CAVE_FOLDERS) {
                const keys = BiomeFurniture.keysOf(e.folder);
                if (!keys.length && BiomeFurniture.spritesIn(e.folder).length) { pool.push(e); continue; }
                for (const k of keys) {
                    if (!BiomeFurniture.spritesIn(k).length) continue;
                    pool.push({ folder: k, density: e.density / keys.length, kind: e.kind });
                }
            }
            if (!pool.length) return;
            const total = pool.reduce((s, e) => s + e.density, 0) || 1;
            const chosen = new Map();
            for (let k = 0; k < 2; k++) {
                let r = this._seededRandom(wx, wy, 7100 + k) * total;
                for (const e of pool) {
                    r -= e.density;
                    if (r <= 0) { chosen.set(e.folder, e); break; }
                }
            }
            const cats = (BiomeFurniture.map() || {}).categories || {};
            let seed = 7200;
            for (const e of chosen.values()) {
                const want = CAVE_SCATTER_MIN +
                    Math.round(this._seededRandom(wx, wy, seed) * CAVE_SCATTER_VAR * e.density);
                const items = [];
                for (let i = 0; i < want * CAVE_SCATTER_TRIES && items.length < want; i++) {
                    const lx = (this._seededRandom(wx, wy, seed + i * 3 + 1) - 0.5) * (tileSize * 0.92);
                    const lz = (this._seededRandom(wx, wy, seed + i * 3 + 2) - 0.5) * (tileSize * 0.92);
                    const y = floorFn((wx + 0.5) * tileSize + lx, (wy + 0.5) * tileSize + lz);
                    if (y == null) continue;
                    const scale = 0.6 + this._seededRandom(wx, wy, seed + i * 3 + 3) * 0.9;
                    items.push({ x: lx, y, z: lz, rotY: 0, scale, key: 'cave' + seed + ':' + i });  // i18n-ignore  prop key
                }
                if (!items.length) { seed += 90; continue; }
                const sprites = BiomeFurniture.spritesIn(e.folder);
                const size = (cats[e.folder] && cats[e.folder].size) || BiomeFurniture.sizeOf(e.folder);
                this._scatterBillboards(grp, e.folder, sprites,
                    e.kind === 'rock' ? this.spriteQuads.rock : this.spriteQuads.plant,
                    items, size, wx, wy, seed, e.kind);
                seed += 90;
            }
        }

        // The chests of a cave square, put down on the floor of an actual
        // passage rather than on the surface a hundred metres over it. Called
        // instead of the whole decoration pass while the party is underground
        // (VoxelTerrain._buildChunk), because a cave costs enough to draw
        // without a wood being scattered over its roof.
        //
        //   floorFn(x, z)  the floor of the passage at a world point, or null
        // The chests of one of the places under the world (VoxelWorldField's
        // sites), set down on its own furnished spots rather than anywhere on
        // a passage floor: a vault and a goblin hall always hold one and it is
        // a good one; a hut, a room or a grotto sometimes do.
        _scatterSiteChests(grp, wx, wy, tileSize, spots) {
            if (!spots || !spots.length) return;
            let i = 0;
            for (const sp of spots) {
                i++;
                const sure = sp.kind === 'vault' || sp.kind === 'hall';
                const odds = sure ? 1 : sp.kind === 'grotto' ? 0.6 : 0.35;
                if (!sure && this._seededRandom(wx, wy, 7100 + i) >= odds) continue;
                const C = chestFor(sure ? 0.99 : this._seededRandom(wx, wy, 7140 + i));
                this._scatterBillboards(grp, CHEST_FOLDER, [C.sprite], this.spriteQuads.plant,
                    [{ x: sp.x - (wx + 0.5) * tileSize, y: sp.y, z: sp.z - (wy + 0.5) * tileSize,
                       rotY: 0, scale: 1, key: 'sitechest' + i }],   // i18n-ignore  prop key
                    CHEST_SIZE, wx, wy, 7180 + i, 'chest');
            }
        }

        _scatterCaveChests(grp, wx, wy, tileSize, floorFn) {
            if (!floorFn) return;
            let put = 0;
            for (let i = 0; i < 10 && put < CHEST_CAVE_MAX; i++) {
                if (this._seededRandom(wx, wy, 6900 + i) >= CHEST_CAVE_CHANCE) continue;
                const lx = (this._seededRandom(wx, wy, 6920 + i * 3)     - 0.5) * (tileSize * 0.9);
                const lz = (this._seededRandom(wx, wy, 6921 + i * 3) - 0.5) * (tileSize * 0.9);
                const y = floorFn((wx + 0.5) * tileSize + lx, (wy + 0.5) * tileSize + lz);
                if (y == null) continue;
                const C = chestFor(this._seededRandom(wx, wy, 6922 + i * 3));
                this._scatterBillboards(grp, CHEST_FOLDER, [C.sprite], this.spriteQuads.plant,
                    [{ x: lx, y, z: lz, rotY: 0, scale: 1, key: 'cavechest' + i }],   // i18n-ignore  prop key
                    CHEST_SIZE, wx, wy, 6940 + i, 'chest');
                put++;
            }
        }

        // `heightFn(gx, gz)` is the ground, in TILE coordinates; `waterFn(x, z)`
        // is the surface of whatever water stands over a point, in WORLD units,
        // or null where it is dry. Only the sea floor reads the second one.
        decorate(grp, wx, wy, biome, tileSize, heightFn, waterFn) {
            const n = biome.name.toLowerCase();

            // Anything with water on it: the bed of that water, and the rare
            // island standing out of it.
            //
            // A square that is ALL water - the open sea, a lake - is finished
            // there. A river square is not: it renders as water because a
            // channel crosses it, but it is dry land either side of that
            // channel and it still gets its wood, its grass and its rocks.
            if (getRenderType(biome.name) === 'water') {
                this._decorateWater(grp, wx, wy, biome, tileSize, heightFn, waterFn);
                if (profileFor(biome.name).water) return;
            }

            // Coastlines get sparse palms regardless of the land biome archetype.
            this._decorateBeach(grp, wx, wy, tileSize, heightFn);

            // Harbours get a full hand-built dock scene instead of scattered models.
            if (n.includes('docks') || n.includes('harbor') || n.includes('harbour') ||
                n.includes('wharf') || n.includes('pier') || n.includes('marina')) {
                this._decorateDocks(grp, wx, wy);
                return;
            }

            // Cities / towns / villages: a proper dense street grid of buildings
            // plus a roadside fuel station, instead of a sparse random scatter.
            const isCity = n.includes('city') || n.includes('metro') ||
                           n.includes('omegatower') || n.includes('spacecenter');
            const isTown = n.includes('village') || n.includes('villa') ||
                           n.includes('burg') || n.includes('town') || n.includes('houses');
            if (isCity || isTown) {
                this._decorateSettlement(grp, wx, wy, isCity, heightFn);
                // A street is not bare either: the signs, bins, benches, crates
                // and parked bicycles of the place go down between the buildings.
                const townCount = 8 + Math.floor(this._seededRandom(wx, wy, 61) * 8);
                this._scatterFurniture(grp, wx, wy, biome,
                    this._townItemGen(wx, wy, tileSize, heightFn), townCount, SKIP_CURATED, 6500);
                return;   // the town fills the tile; skip the wilderness scatter
            }

            // What somebody built on this square, if anything. A steading (a
            // farm, a cottage) is a place people live in and is put up whole;
            // a ruin gets what is left of it. They are the same roll and only
            // one of them is ever on a square, so at most one of these does
            // anything.
            const lived = this._decorateSteading(grp, wx, wy, heightFn);
            // A ruin, before the wilderness scatter goes round it (a tree
            // growing through a roofless barn is the point). Whether one went
            // up decides how likely a chest is on this square: somebody left
            // something behind in a ruin, and hardly ever in a field.
            const ruined = !lived && !!this._decorateAbandoned(grp, wx, wy, heightFn);

            // Base scatter count from the biome's feature density.
            const baseDensity = biome.features ? biome.features.reduce((sum, f) => sum + (f.density || 0), 0) : 2;
            const baseCount = Math.floor(this._seededRandom(wx, wy, 0) * 10 * baseDensity) + 5;

            // Somebody's yard is swept: a farmhouse does not get a forest
            // scattered through its kitchen the way a ruin happily does.
            const keepOut = lived ? (planForTile(wx, wy) || {}).solids || [] : [];

            // Deterministic placement generator. Spreads `count` points across the
            // tile, keeping a central corridor clear so the camper has a lane, and
            // rejecting points that fall underwater / on steep beach slopes.
            const corridor = tileSize * 0.06;
            const genItems = (count, seed) => {
                const out = [];
                for (let i = 0; i < count; i++) {
                    const lx = (this._seededRandom(wx, wy, i * 4 + seed)     - 0.5) * (tileSize * 0.9);
                    const lz = (this._seededRandom(wx, wy, i * 4 + seed + 1) - 0.5) * (tileSize * 0.9);
                    if (Math.abs(lx) < corridor && Math.abs(lz) < corridor) continue;
                    if (keepOut.some(s => Math.abs(lx - s.x) < s.w / 2 + 6 &&
                                          Math.abs(lz - s.z) < s.d / 2 + 6)) continue;
                    const yPos = heightFn ? heightFn(wx + 0.5 + lx / tileSize, wy + 0.5 + lz / tileSize) : 0;
                    if (yPos < -0.5) continue;
                    const scale = 0.6 + this._seededRandom(wx, wy, i * 4 + seed + 2) * 0.75;
                    const rotY  = this._seededRandom(wx, wy, i * 4 + seed + 3) * Math.PI * 2;
                    // Its own name, stable for as long as the world is: the
                    // group it was scattered in and where in that group it came.
                    // A tree cut down is remembered by this and by nothing else.
                    out.push({ x: lx, y: yPos, z: lz, rotY, scale, key: seed + ':' + i });
                }
                return out;
            };

            // --- 3D structural props (buildings, cactus, ruins, etc.) ---
            const arch = this._archetypeFor(n);
            if (arch) {
                let count = baseCount;
                if (arch.density != null) count = Math.round(count * arch.density);
                const items = genItems(count, 1);
                const place = (layer) => {
                    if (!layer || !items.length) return;
                    const s = layer.scale || 1;
                    const list = s === 1 ? items : items.map(p => ({ ...p, scale: p.scale * s }));
                    this._instance(grp, this.geos[layer.g], layer.mat || layer.c, list);
                };
                place(arch.l1);
                place(arch.l2);
            }

            // --- 2D billboard trees (sized to match the 1x 3D props: ~40 tall) ---
            // A hand-picked list wins over the name tables, and a hand-picked
            // EMPTY list means this biome is meant to be bare of them.
            const treePicked = BiomeSprites.groups(biome.name, 'tree');
            const treePool   = treePicked ? null : this._treePoolFor(n);
            if (treePicked) {
                this._scatterPicked(grp, treePicked, this.spriteQuads.tree,
                    genItems(Math.round(baseCount * 1.2), 40), wx, wy, 313, 'tree', 30);
            } else if (treePool) {
                this._scatterBillboards(grp, 'Trees', treePool, this.spriteQuads.tree,  // i18n-ignore  scatter group id
                    genItems(Math.round(baseCount * 1.2), 40), 30, wx, wy, 313, 'tree');
            }
            const hasTrees = treePicked ? treePicked.length > 0 : !!treePool;

            // --- 2D billboard plants / ground cover ---
            const plantPicked = BiomeSprites.groups(biome.name, 'plant');
            const plantPool   = plantPicked ? null : this._plantPoolFor(n);
            if (plantPicked) {
                this._scatterPicked(grp, plantPicked, this.spriteQuads.plant,
                    genItems(Math.round(baseCount * 0.9), 200), wx, wy, 517, 'plant', 11);
            } else if (plantPool) {
                this._scatterBillboards(grp, 'Plants', plantPool, this.spriteQuads.plant,  // i18n-ignore  scatter group id
                    genItems(Math.round(baseCount * 0.9), 200), 11, wx, wy, 517, 'plant');
            }

            // --- 2D billboard rocks ---
            const rockPicked = BiomeSprites.groups(biome.name, 'rock');
            if (rockPicked) {
                this._scatterPicked(grp, rockPicked, this.spriteQuads.rock,
                    genItems(Math.round(baseCount * 0.7), 900), wx, wy, 733, 'rock', 13);
            } else {
                let rockPool = this._rockPoolFor(n);
                // Nothing else claimed this tile? Sprinkle sparse rocks so it isn't barren.
                const sparse = !rockPool && !arch && !hasTrees;
                if (sparse) rockPool = ROCK_POOL;
                if (rockPool) {
                    const rc = Math.round(baseCount * (sparse ? 0.4 : 0.7));
                    this._scatterBillboards(grp, 'Rocks', rockPool, this.spriteQuads.rock,  // i18n-ignore  scatter group id
                        genItems(rc, 900), 13, wx, wy, 733, 'rock');
                }
            }

            // --- and everything else this biome is furnished with ---
            this._scatterFurniture(grp, wx, wy, biome, genItems, baseCount, SKIP_CURATED, 6300);

            // --- the chest, on the rare square that holds one ---
            this._scatterChests(grp, wx, wy, biome, tileSize, heightFn, ruined);
        }

        // Where a prop may stand in a town: off the buildings' own footprints is
        // the planner's business, so this only keeps them out of the middle of
        // the square where the through road runs.
        _townItemGen(wx, wy, tileSize, heightFn) {
            return (count, seed) => {
                const out = [];
                for (let i = 0; i < count; i++) {
                    const lx = (this._seededRandom(wx, wy, i * 4 + seed)     - 0.5) * (tileSize * 0.86);
                    const lz = (this._seededRandom(wx, wy, i * 4 + seed + 1) - 0.5) * (tileSize * 0.86);
                    const yPos = heightFn ? heightFn(wx + 0.5 + lx / tileSize, wy + 0.5 + lz / tileSize) : 0;
                    if (yPos < -0.5) continue;
                    out.push({
                        x: lx, y: yPos, z: lz,
                        rotY: this._seededRandom(wx, wy, i * 4 + seed + 3) * Math.PI * 2,
                        scale: 0.8 + this._seededRandom(wx, wy, i * 4 + seed + 2) * 0.5,
                        key: seed + ':' + i
                    });
                }
                return out;
            };
        }

        dispose() {
            for (const key in this.geos) {
                this.geos[key].dispose();
            }
            if (this.spriteQuads) for (const k in this.spriteQuads) this.spriteQuads[k].dispose();
            if (this._spriteTex) { for (const t of this._spriteTex.values()) t.dispose(); this._spriteTex.clear(); }
            // The facades are BLOCKS: shared by every decorator and every
            // square in the world, so they are not this one's to throw away.
            // They go when the world does (VoxelWorld.Blocks.dispose).
        }
    }

    // =========================================================================
    // The Omega Tower
    //
    // The spear Eris drove into the Earth in 1992, drawn the way the intro
    // movie (StartinMovie.js) draws it: one tapering eight-sided shaft of dark
    // stone run through with a grid of gold, lit windows scattered up its
    // faces, a sheath of light round it, five rings standing off it that hold
    // the dimensions together, and the celestial throne floating over its tip
    // with a beacon burning in it. It is not a building the town planner could
    // make and it is not terrain, so it is neither chunked nor streamed: it is
    // built once, stood in the world, and drawn from wherever the party happens
    // to be (see the scene's _updateOmegaTower, which is what makes it visible
    // from the far side of the map).
    //
    // THE PROPORTIONS are the movie's, measured in its own unit: a shaft 900
    // tall, 26 across the foot and 5 at the tip, the throne 40 over it. Here
    // the shaft is a little stouter so its foot fills the plinth it stands on.
    //
    // THE GOLD BURNS AT NIGHT. The shaft's grid is its emissive map and the
    // scene turns its intensity up as the light goes (setNightGlow, driven by
    // the day factor), so at dusk the whole spear comes up lit and the tower is
    // at its most visible exactly when there is least else to see by.
    // =========================================================================
    // Folders of a biome's furniture that are ground cover rather than things
    // in the way: you walk through grass and flowers, not round them.
    const PLANT_FOLDERS = /grass|flower|plant|weed|moss|lichen|fern|reed|clover|leaf|leaves|shrub|ivy|vine|crop|wheat|hay/i;

    const OMEGA_HULL = 0x3a342c;    // the shaft's stone, under its gold grid
    const OMEGA_GLOW = 0xffc060;    // what the grid and the windows burn with
    const OMEGA_GOLD = 0xffd36a;    // the throne
    // What the shaft is lit from within by at noon and at midnight. The scene
    // slides between the two every frame off its own day factor.
    const OMEGA_GLOW_DAY   = 0.2;
    const OMEGA_GLOW_NIGHT = 1.0;

    // The movie's own measurements, in its own unit.
    const MOVIE_SHAFT_H = 900;
    const MOVIE_FOOT_R = 26, MOVIE_TIP_R = 5;
    const MOVIE_THRONE_UP = 40;
    // How much of the tower's height is the shaft; the throne floats in the rest.
    const SHAFT_FRAC = 0.9;
    // How much stouter than the movie's spear this one is.
    const OMEGA_STOUT = 1.4;
    // Where up the shaft the five rings stand.
    const OMEGA_RINGS = [0.18, 0.36, 0.55, 0.74, 0.9];

    // The plan, as plain numbers, worked out once per size and kept so the
    // geometry and anything that wants to measure the thing agree:
    //   base   the footprint across        tip    the top of the shaft (the muzzle)
    //   footR  the shaft's radius at foot  tipR   ...and at the tip
    //   unit   one movie unit in tower units
    //   rings  [{ y, r, tube }]            throneY where the throne floats
    function omegaTowerPlan(span, height) {
        const base = span * WORLD_TILE_SIZE;
        const tip = height * SHAFT_FRAC;
        const unit = tip / MOVIE_SHAFT_H;
        const footR = Math.min(base * 0.45, MOVIE_FOOT_R * unit * OMEGA_STOUT);
        const tipR = footR * MOVIE_TIP_R / MOVIE_FOOT_R;
        const f = footR / MOVIE_FOOT_R;
        const rings = OMEGA_RINGS.map((k) => ({
            y: tip * k,
            r: footR + (tipR - footR) * k + 7 * f,
            tube: (0.9 + (1 - k) * 1.2) * f,
        }));
        return { base, tip, top: tip, height, unit, footR, tipR, rings, throneY: tip + MOVIE_THRONE_UP * unit };
    }

    // The shaft's skin, painted once: the movie's dark stone, its gold grid and
    // its windows, some warm and some the cold blue of the rings.
    let _omegaSkin;
    function omegaSkinCanvas() {
        if (_omegaSkin !== undefined) return _omegaSkin;
        _omegaSkin = null;
        if (typeof document === 'undefined' || !document.createElement) return null;
        const c = document.createElement('canvas');
        c.width = 256; c.height = 1024;
        const ctx = c.getContext && c.getContext('2d');
        if (!ctx) return null;
        const w = c.width, h = c.height;
        let s = 0x0e9a;
        const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        ctx.fillStyle = '#14110d';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = 'rgba(' + (40 + Math.floor(r() * 40)) + ',34,26,0.6)';
            ctx.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 4);
        }
        ctx.fillStyle = 'rgba(255,200,90,0.95)';
        for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h);
        for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = r() > 0.5 ? 'rgba(255,226,150,0.9)' : 'rgba(160,220,255,0.7)';
            ctx.fillRect(Math.floor(r() * 8) * 32 + 6 + r() * 20, r() * h, 2, 2);
        }
        _omegaSkin = c;
        return c;
    }

    // The beacon's soft round light.
    function omegaGlowCanvas() {
        if (typeof document === 'undefined' || !document.createElement) return null;
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext && c.getContext('2d');
        if (!ctx) return null;
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,250,225,1)');
        g.addColorStop(0.25, 'rgba(255,210,90,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        return c;
    }

    // The tower as a group standing on y = 0, ready to be put wherever the
    // scene wants it. A handful of meshes, so a handful of draw calls.
    //
    // Every material has its fog turned off: a landmark meant to be seen from
    // the far side of the world cannot be allowed to fade into the haze at four
    // thousand units like a hedge. Every piece is built at the group's origin
    // with its geometry moved into place, so a shader reading a vertex's own
    // y reads tower units (the launch cinematic charges the shaft by height).
    //
    // opts.bore, when given, is the radius of a round shaft cut straight down
    // the tower's axis, in tower units: the launch cinematic fires its round up
    // the middle of the thing, so the spear is built hollow round it, the tip
    // is left open as the muzzle and the throne is not built over it.
    function buildOmegaTower(span, height, opts) {
        const plan = omegaTowerPlan(span, height);
        const bore = (opts && opts.bore > 0) ? opts.bore : 0;
        const group = new THREE.Group();
        const geos = [], mats = [], texs = [];
        const own = (list, x) => { list.push(x); return x; };
        const fogless = (m) => { m.fog = false; return own(mats, m); };
        const additive = (color, opacity) => fogless(new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        const mesh = (geo, mat) => {
            const m = new THREE.Mesh(own(geos, geo), mat);
            m.frustumCulled = false;
            group.add(m);
            return m;
        };
        const tip = plan.tip;
        const tipR = Math.max(plan.tipR, bore * 1.6);
        const footR = Math.max(plan.footR, tipR);
        const f = footR / MOVIE_FOOT_R;
        const u = plan.unit;

        // THE SHAFT. Its gold grid is both its colour and its light.
        const skin = omegaSkinCanvas();
        let tex = null;
        if (skin && THREE.CanvasTexture) {
            tex = own(texs, new THREE.CanvasTexture(skin));
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(6, 12);
        }
        const hullOpts = {
            color: OMEGA_HULL, emissive: OMEGA_GLOW, emissiveIntensity: OMEGA_GLOW_DAY,
            side: bore ? THREE.DoubleSide : THREE.FrontSide
        };
        if (tex) { hullOpts.map = tex; hullOpts.emissiveMap = tex; }
        const hull = fogless(new THREE.MeshLambertMaterial(hullOpts));
        mesh(new THREE.CylinderGeometry(tipR, footR, tip, 8, 24, !!bore).translate(0, tip / 2, 0), hull);
        if (bore) {
            // The bore's own wall, and the open ring of the muzzle round it.
            mesh(new THREE.CylinderGeometry(bore, bore, tip, 8, 1, true).translate(0, tip / 2, 0), hull);
            mesh(new THREE.RingGeometry(bore, tipR, 8).rotateX(-Math.PI / 2).translate(0, tip, 0), hull);
        }
        // The sheath of light round it.
        const glow = additive(0xffb040, 0.12);
        mesh(new THREE.CylinderGeometry(9 * f, 40 * f, tip, 16, 1, true).translate(0, tip / 2, 0), glow);

        // THE RINGS that hold the dimensions together, gold and blue in turn.
        const rings = plan.rings.map((rg, i) => {
            const k = rg.y / tip;
            const geo = new THREE.TorusGeometry(footR + (tipR - footR) * k + 7 * f, rg.tube, 6, 48)
                .rotateX(Math.PI / 2).translate(0, rg.y, 0);
            return mesh(geo, additive(i % 2 ? 0x9ad8ff : 0xffd070, 0.85));
        });

        // THE CELESTIAL THRONE, floating over the tip. Not over a muzzle.
        let throne = null, beacon = null;
        const gold = fogless(new THREE.MeshLambertMaterial({
            color: OMEGA_GOLD, emissive: 0xc08a20, emissiveIntensity: 0.9
        }));
        if (!bore) {
            throne = new THREE.Group();
            throne.position.y = plan.throneY;
            const part = (geo, mat, x, y, z) => {
                const m = new THREE.Mesh(own(geos, geo), mat);
                m.position.set(x, y, z);
                m.frustumCulled = false;
                throne.add(m);
                return m;
            };
            part(new THREE.BoxGeometry(18 * u, 4 * u, 14 * u), gold, 0, 0, 0);
            part(new THREE.BoxGeometry(18 * u, 26 * u, 3 * u), gold, 0, 13 * u, -6 * u);
            part(new THREE.TorusGeometry(16 * u, 1.2 * u, 6, 48), additive(0xfff2c0, 0.9), 0, 30 * u, -7 * u);
            for (const x of [-1, 0, 1]) {
                part(new THREE.ConeGeometry(2.4 * u, 26 * u, 6), gold, x * 12 * u, (30 + (x ? 0 : 10)) * u, -6 * u);
            }
            const glowSrc = omegaGlowCanvas();
            if (glowSrc && THREE.Sprite && THREE.CanvasTexture) {
                const bm = fogless(new THREE.SpriteMaterial({
                    map: own(texs, new THREE.CanvasTexture(glowSrc)), color: 0xfff4d0,
                    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                }));
                beacon = new THREE.Sprite(bm);
                beacon.position.y = 20 * u;
                beacon.scale.setScalar(120 * u);
                beacon.frustumCulled = false;
                throne.add(beacon);
            }
            group.add(throne);
        }

        return {
            group, plan,
            // The shaft's lit material, for a caller that drives more than the
            // night glow through it (the launch cinematic charges the tower).
            gold: hull,
            // How hard the shaft burns, 0 at noon and 1 at the dead of night.
            // Called every frame by the scene off its own day factor.
            setNightGlow(k) {
                const t = Math.max(0, Math.min(1, k));
                hull.emissiveIntensity = OMEGA_GLOW_DAY + (OMEGA_GLOW_NIGHT - OMEGA_GLOW_DAY) * t;
                glow.opacity = 0.08 + 0.14 * t;
            },
            // The throne turns and the beacon breathes, as they do in the movie.
            tick(seconds) {
                if (throne) throne.rotation.y = seconds * 0.05;
                if (beacon) beacon.material.opacity = 0.7 + 0.3 * Math.sin(seconds * 2.2);
            },
            rings,
            dispose() {
                for (const g of geos) g.dispose();
                for (const m of mats) m.dispose();
                for (const t of texs) t.dispose();
                if (group.parent) group.parent.remove(group);
            }
        };
    }

    // =========================================================================
    // BiomeFurniture
    //
    // Which of the seven thousand furniture sprites belong in a place, and how
    // many of them. The answer is js/db/WorldGen/biomeFurniture.json, generated
    // from the folders that actually exist under img/furniture (see
    // tools/build-biome-furniture.js): per biome, the folders that suit its
    // outdoors and the folders that suit the inside of a building there, each
    // with a density and a real-world size.
    //
    // Everything here is worked out once and kept. The map is registered rather
    // than loaded (DataService), so a session that never decorates anything
    // never reads it at all.
    // =========================================================================
    const BiomeFurniture = {
        _map: undefined,
        _byFolder: null,
        _cache: new Map(),

        map() {
            if (this._map === undefined) {
                this._map = (window.WorldGen && window.WorldGen.biomeFurniture) || null;
            }
            return this._map;
        },

        // Every sprite in a folder. The game ships an index the other way round
        // (sprite -> folder, for the shop and the placement menu), so it is
        // turned over once here and kept. The index files a sprite two levels
        // deep ('Trees/Conifers'); asked for a bare category ('Trees') this
        // answers with every subfolder of it, so a list written in categories
        // (the caves, the sea floor, a shop's fittings) still gets its art.
        _index() {
            if (!this._byFolder) {
                this._byFolder = new Map();
                this._byCategory = new Map();
                const index = (window.Items && window.Items.FurnitureImageFolders) || null;
                if (index) {
                    for (const id in index) {
                        const f = index[id];
                        let arr = this._byFolder.get(f);
                        if (!arr) { arr = []; this._byFolder.set(f, arr); }
                        arr.push(id + '.png');
                        const cat = f.indexOf('/') >= 0 ? f.slice(0, f.indexOf('/')) : f;
                        if (cat !== f) {
                            let all = this._byCategory.get(cat);
                            if (!all) { all = []; this._byCategory.set(cat, all); }
                            all.push(id + '.png');
                        }
                    }
                }
            }
            return this._byFolder;
        },
        spritesIn(folder) {
            const by = this._index();
            return by.get(folder) || this._byCategory.get(folder) || [];
        },
        // The category a map key belongs to: 'Trees' for 'Trees/Conifers'.
        categoryOf(folder) {
            const i = folder.indexOf('/');
            return i >= 0 ? folder.slice(0, i) : folder;
        },
        // Every key of the map under a category, for a list that names the
        // category and wants to pick among its subfolders.
        keysOf(category) {
            const map = this.map();
            const cats = (map && map.categories) || {};
            const out = [];
            for (const k in cats) if (this.categoryOf(k) === category) out.push(k);
            return out;
        },
        // How tall a piece of a key (or of a category: its tallest kind) is.
        sizeOf(folder) {
            const map = this.map();
            const cats = (map && map.categories) || {};
            if (cats[folder]) return cats[folder].size || 11;
            let best = 0;
            for (const k in cats) if (this.categoryOf(k) === folder && (cats[k].size || 0) > best) best = cats[k].size;
            return best || 11;
        },

        // The outdoor list for a biome, as something ready to scatter: the
        // folder, how thick it should lie, how big a piece is and what pieces
        // there are. Empty where a biome names nothing, or where the map or the
        // sprite index is missing.
        exterior(biomeName) { return this._list(biomeName, 'exterior'); },
        interior(biomeName) { return this._list(biomeName, 'interior'); },

        _list(biomeName, which) {
            const key = which + ':' + biomeName;
            const hit = this._cache.get(key);
            if (hit) return hit;
            const map = this.map();
            const entry = map && map.biomes && map.biomes[biomeName];
            const out = [];
            if (entry && entry[which]) {
                for (const folder in entry[which]) {
                    const cat = map.categories[folder];
                    const sprites = this.spritesIn(folder);
                    if (!cat || !sprites.length) continue;
                    out.push({
                        folder, density: entry[which][folder],
                        size: cat.size || 11, rooms: cat.rooms || null, sprites
                    });
                }
            }
            this._cache.set(key, out);
            return out;
        },
    };

    // =========================================================================
    // BiomeSprites
    //
    // Which billboards a biome scatters, where somebody has said so by hand.
    // The name-matching tables in ProceduralDecorator answer for every biome in
    // the world, which is what a world of a hundred and seventy biomes needs;
    // this is the exception written over them, picked sprite by sprite in the
    // Biome Sprites tool (tools -> Biome Sprites) and kept in
    // js/db/WorldGen/biomeSprites.json, one entry per biome gone over by hand.
    //
    // A category named here REPLACES the pool the name match would have chosen,
    // and an EMPTY list means the biome shows none of that kind at all, which is
    // the only way to say "no trees here" to a name the tree table likes. Each
    // sprite is named folder first ('Trees/apple_tree.png'), so a biome may
    // scatter anything under img/furniture as its trees, its rocks or its
    // ground cover.
    // =========================================================================
    const BiomeSprites = {
        _map: undefined,
        _cache: new Map(),

        map() {
            if (this._map === undefined) {
                this._map = (window.WorldGen && window.WorldGen.biomeSprites) || null;
            }
            return this._map;
        },

        // A biome's hand-picked list for one category, gathered by folder as
        // [{ folder, sprites }], or null where the biome says nothing about that
        // category and the built-in tables should answer for it.
        groups(biomeName, kind) {
            const key = kind + ':' + biomeName;
            if (this._cache.has(key)) return this._cache.get(key);
            const map = this.map();
            const entry = map && map.biomes && map.biomes[biomeName];
            const list = entry && entry[kind];
            let out = null;
            if (Array.isArray(list)) {
                const byFolder = new Map();
                for (const item of list) {
                    const cut = String(item).lastIndexOf('/');
                    if (cut <= 0) continue;
                    const folder = String(item).slice(0, cut);
                    let arr = byFolder.get(folder);
                    if (!arr) { arr = []; byFolder.set(folder, arr); }
                    arr.push(String(item).slice(cut + 1));
                }
                out = Array.from(byFolder, ([folder, sprites]) => ({ folder, sprites }));
            }
            this._cache.set(key, out);
            return out;
        }
    };

    // =========================================================================
    // ShopFurniture
    //
    // What a shop of a given kind looks like inside, and where a shop of that
    // kind is found. The answer is js/db/WorldGen/shopFurniture.json, generated
    // from RandomDailyShop's own sixty-one themed shops and the folders under
    // img/furniture (see tools/build-shop-furniture.js).
    //
    // The shop TYPE is the link between the two halves of a shop: it dresses the
    // room, and it is what the shopkeeper behind the counter opens when you ask
    // to see the stock.
    // =========================================================================
    const ShopFurniture = {
        _map: undefined,
        _byWhere: null,
        _cache: new Map(),

        map() {
            if (this._map === undefined) {
                this._map = (window.WorldGen && window.WorldGen.shopFurniture) || null;
            }
            return this._map;
        },

        // Every kind of shop that can stand in a settlement of this kind
        // ('village' or 'city'), in a fixed order so a square that picks the
        // third one always picks the same third one.
        typesFor(where) {
            if (!this._byWhere) {
                this._byWhere = new Map();
                const map = this.map();
                if (map && map.shops) {
                    for (const kind of ['village', 'city']) {
                        this._byWhere.set(kind, Object.keys(map.shops)
                            .filter(t => (map.shops[t].where || []).includes(kind)).sort());
                    }
                }
            }
            return this._byWhere.get(where) || [];
        },

        // The folders that dress a shop of this type, ready to scatter: the
        // folder, how thickly, how big a piece is and what pieces there are.
        furniture(shopType) {
            const hit = this._cache.get(shopType);
            if (hit) return hit;
            const map = this.map();
            const shop = map && map.shops && map.shops[shopType];
            const out = [];
            if (shop) {
                const cats = (BiomeFurniture.map() || {}).categories || {};
                for (const folder in shop.furniture) {
                    const sprites = BiomeFurniture.spritesIn(folder);
                    if (!sprites.length) continue;
                    out.push({
                        folder, density: shop.furniture[folder],
                        size: (cats[folder] && cats[folder].size) || BiomeFurniture.sizeOf(folder), sprites
                    });
                }
            }
            this._cache.set(shopType, out);
            return out;
        },

        // Does this type exist at all? Used to fall back gracefully when the map
        // is not there.
        has(shopType) {
            const map = this.map();
            return !!(map && map.shops && map.shops[shopType]);
        }
    };

    // Handed to the rest of the suite.
    Object.assign(VW, {
        BiomeFurniture, BiomeSprites, ProceduralDecorator, ShopFurniture,
        buildOmegaTower, omegaTowerPlan,
        CHESTS, CHEST_FOLDER, chestKindOf
    });
})();
