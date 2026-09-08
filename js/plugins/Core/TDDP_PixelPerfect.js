//=============================================================================
// RPG Maker MZ - Pixel Perfect scaling
//=============================================================================

/*:
 * @target MZ
* @plugindesc 1.2.1 Enable pixel perfect scaling mode for your game
* @author Galenmereth / TDD
* @help
============================================================================
Information
============================================================================
Optinally add an ingame menu option for your players to turn off or on the
pixel perfect mode and/or subpixel stretching.

The default translations of label values are done using Google Translate,
so if somehow any of the text has turned out horrifically offensive,
please change it to what you want as I simply don't know any better and tried
my best :')

============================================================================
Changelog
============================================================================
1.2.1
	[Fixed]
	Polyfill to work with MV
1.2.0
	[Fixed]
	Custom scaling and positioning mode of canvas when pixel perfect mode is
	on, removing the potential for subpixel centering as well as subpixel
	scaling of the content, which both could separately cause blurry pixels

	[Feature]
	Added "Allow stretch scaling" option, as well as in-game option. By default
	this is "on" and behaves like default MZ, allowing the scale of the game's
	content to be scaled to decimal ratios like 2.2, which isn't great if your
	game relies on low-fidelity pixel art. By turning this "off", only whole
	integers are allowed

* @url https://galenmereth.itch.io/
*
* @param enableIngameOptions
* @text Enable ingame option
* @desc Toggle if you want to display an ingame option for players to turn on/off pixel perfect modes ingame
* @type boolean
* @default false
*
* @param allowStretching
* @text Allow stretch scaling
* @desc Toggle whether to allow subpixel stretch-scaling when pressing F3 in fullscreen mode. If false, will scale to nearest integer, rather than say "2.2". Default is true.
* @type boolean
* @default true
*
* @param labels
* @text Ingame option labels
* 
* @param en
* @parent labels
* @text EN - English
* @type struct<enLabels>
* @default {"mode":"Pixel Perfect Mode","stretch":"Allow stretching"}
* 
* @param ja
* @parent labels
* @text JA - Japanese
* @type struct<jaLabels>
* @default {"mode":"ピクセルパーフェクトモード","stretch":"ストレッチを許可する"}
* 
* @param zh
* @parent labels
* @text ZH - Chinese
* @type struct<zhLabels>
* @default {"mode":"像素完美模式","stretch":"允许拉伸"}
* 
* @param ko
* @parent labels
* @text KO - Korean
* @type struct<koLabels>
* @default {"mode":"픽셀 퍼펙트 모드","stretch":"스트레칭을 허용합니다"}
* 
* @param ru
* @parent labels
* @text RU - Russian
* @type text
* @type struct<ruLabels>
* @default {"mode":"Разрешить растягивание этикетки","stretch":"Разрешить растягивание"}
*/

/*:ja
* @plugindesc 1.2.1 ゲームのピクセルパーフェクトスケーリングモードを有効にする
* @author Galenmereth / TDD
* @help
============================================================================
Information
============================================================================
私は日本語が堪能ではないので、これは Google Translate を使用して翻訳されています。それでも役に立つことを願っています。

オプションで、プレイヤーがピクセル パーフェクト モードをオンまたはオフにできるゲーム内メニュー オプションを追加します。

* @url https://galenmereth.itch.io/
*
* @param enableIngameOptions
* @text ゲーム内オプションを有効にする
* @desc プレーヤーがゲーム内でPixelPerfectモードをオン/オフするためのゲーム内オプションを表示する場合は切り替えます
* @type boolean
* @default false
* 
* @param labels
* @text ゲーム内オプションラベル
* 
* @param en
* @parent labels
* @text EN - 英語
* @type struct<enLabels>
* @default {"mode":"Pixel Perfect Mode","stretch":"Allow stretching"}
* 
* @param ja
* @parent labels
* @text JP - 日本
* @type struct<jaLabels>
* @default {"mode":"ピクセルパーフェクトモード","stretch":"ストレッチを許可する"}
* 
* @param zh
* @parent labels
* @text ZH - 中国語
* @type struct<zhLabels>
* @default {"mode":"像素完美模式","stretch":"允许拉伸"}
* 
* @param ko
* @parent labels
* @text KO - 韓国語
* @type struct<koLabels>
* @default {"mode":"픽셀 퍼펙트 모드","stretch":"스트레칭을 허용합니다"}
* 
* @param ru
* @parent labels
* @text RU - ロシア
* @type struct<ruLabels>
* @default {"mode":"Разрешить растягивание этикетки","stretch":"Разрешить растягивание"}
*/

/*~struct~enLabels:
	@param mode
	@text Feature label
	@type text
	@default Pixel Perfect Mode

	@param stretch
	@text Allow stretching label
	@type text
	@default Allow stretching
*/

/*~struct~jaLabels:
	@param mode
	@type text
	@default ピクセルパーフェクトモード

	@param stretch
	@type text
	@default ストレッチを許可する
*/

/*~struct~zhLabels:
	@param mode
	@text 特征标签
	@type text
	@default 像素完美模式

	@param stretch
	@text 允许拉伸标签
	@type text
	@default 允许拉伸
*/

/*~struct~koLabels:
	@param mode
	@text 기능 라벨
	@type text
	@default 픽셀 퍼펙트 모드

	@param stretch
	@text 라벨 확장 허용
	@type text
	@default 스트레칭을 허용합니다
*/

/*~struct~ruLabels:
	@param mode
	@text Ярлык функции
	@type text
	@default Режим Pixel Perfect

	@param stretch
	@text Разрешить растягивание этикетки
	@type text
	@default Разрешить растягивание
*/



/*
MIT License

Copyright (c) 2025 Galenmereth / TDD

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(() => {
	'use strict';

	////////////////////////////////////////////////////////////////////////
	// Fetch parameters
	////////////////////////////////////////////////////////////////////////
	const script = document.currentScript;
	let name = script.src.split('/');
	name = name[name.length-1].replace('.js','');

	const params = PluginManager.parameters(name);
	['en', 'ja', 'zh', 'ko', 'ru'].forEach(lang => {
		try {
			params[lang] = JSON.parse(params[lang]);
		} catch (e) {
			console.warn(`TDDP_PixelPerfect: failed to parse '${lang}' language param, using empty labels.`, e);
			params[lang] = {};
		}
	});

	// Resolve the active language pack safely. $gameSystem is null at boot, so
	// guard against it when this runs at plugin-eval time.
	function pickLang() {
		let lang = params.en; // default is english
		if ($gameSystem) {
			if ($gameSystem.isJapanese()) lang = params.ja;
			else if ($gameSystem.isChinese()) lang = params.zh;
			else if ($gameSystem.isKorean()) lang = params.ko;
			else if ($gameSystem.isRussian()) lang = params.ru;
		}
		return lang;
	}

	function usePixelPerfectMode() {
		return params.enableIngameOptions == "false" || ConfigManager.TDDP_pixelPerfectMode == true;
	}

	function allowStretching() {
		return (params.enableIngameOptions == "false" && params.allowStretching) || ConfigManager.TDDP_allowStretching == true;
	}

	function innerWidth() {
		if (Graphics._stretchWidth) {
			return Graphics._stretchWidth();
		}
		else {
			return window.innerWidth;
		}
	}

	function innerHeight() {
		if (Graphics._stretchHeight) {
			return Graphics._stretchHeight();
		}
		else {
			return window.innerHeight;
		}
	}

	////////////////////////////////////////////////////////////////////////
	// Bitmap extensions
	///////////////////////////////////////////////////////////////////////
	const _Bitmap_prototype_initialize = Bitmap.prototype.initialize;
	Bitmap.prototype.initialize = function(width, height) {
		_Bitmap_prototype_initialize.call(this, width, height);
		this._smooth = !usePixelPerfectMode();
	}

	////////////////////////////////////////////////////////////////////////
	// Graphics extensions
	///////////////////////////////////////////////////////////////////////
	const _Graphics__centerElement = Graphics._centerElement;
	Graphics._centerElement = function(element) {
    if (usePixelPerfectMode()) {
			const width = Math.round(element.width * this._realScale);
			const height = Math.round(element.height * this._realScale);
			element.style.position = "absolute";
			element.style.margin = "unset";
			element.style.top = `${Math.round((innerHeight() - height) / 2)}px`;
			element.style.left = `${Math.round((innerWidth() - width) / 2)}px`;
			element.style.right = 0;
			element.style.bottom = 0;
			element.style.width = width + "px";
			element.style.height = height + "px";
			element.style.imageRendering = 'pixelated';
		}
		else {
			_Graphics__centerElement.call(this, element);
			element.style.imageRendering = '';
		}
	};

	const Graphics__updateRealScale = Graphics._updateRealScale;
	Graphics._updateRealScale = function() {
		Graphics__updateRealScale.call(this);
		if (!allowStretching()) this._realScale = Math.max(1, Math.floor(this._realScale));
	};

	if (params.enableIngameOptions == "true") {
		////////////////////////////////////////////////////////////////////////
		// Window_Options extensions - only if ingame options enabled in plugin params
		///////////////////////////////////////////////////////////////////////
		if (window.GameOptions) {
			let lang = pickLang();

			window.GameOptions.registerOption('TDDP_pixelPerfectMode', lang.mode,
				() => ConfigManager.TDDP_pixelPerfectMode, 
				(value) => {
					ConfigManager.TDDP_pixelPerfectMode = value;
					Graphics._updateAllElements();
				}, 
				'video', 'boolean');

			window.GameOptions.registerOption('TDDP_allowStretching', lang.stretch, 
				() => ConfigManager.TDDP_allowStretching, 
				(value) => {
					ConfigManager.TDDP_allowStretching = value;
					Graphics._updateAllElements();
				}, 
				'video', 'boolean');
		} else {
			const _Window_Options_prototype_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
			Window_Options.prototype.addGeneralOptions = function() {
				_Window_Options_prototype_addGeneralOptions.call(this);

				let lang = pickLang();

				// i18n-ignore-start  ConfigManager symbols, not labels
				this.addCommand(lang.mode, "TDDP_pixelPerfectMode");
				this.addCommand(lang.stretch, "TDDP_allowStretching");
				// i18n-ignore-end
			};

			const _Window_Options_prototype_setConfigValue = Window_Options.prototype.setConfigValue;
			Window_Options.prototype.setConfigValue = function(symbol, volume) {
				_Window_Options_prototype_setConfigValue.call(this, symbol, volume);
				
				if (symbol == 'TDDP_pixelPerfectMode' || symbol == 'TDDP_allowStretching') {
					Graphics._updateAllElements();
					this.refresh();
				}
			};
		}

		////////////////////////////////////////////////////////////////////////
		// ConfigManager extensions - only if ingame options enabled in plugin params
		///////////////////////////////////////////////////////////////////////
		const _ConfigManager_makeData = ConfigManager.makeData;
		ConfigManager.makeData = function() {
			const config = _ConfigManager_makeData.call(this);
			config.TDDP_pixelPerfectMode = this.TDDP_pixelPerfectMode;
			config.TDDP_allowStretching = this.TDDP_allowStretching;
			return config
		}
		
		const _ConfigManager_applyData = ConfigManager.applyData;
		ConfigManager.applyData = function(config) {
			_ConfigManager_applyData.call(this, config);
			this.TDDP_pixelPerfectMode = this.readFlag(config, "TDDP_pixelPerfectMode", true);
			this.TDDP_allowStretching = this.readFlag(config, "TDDP_allowStretching", true);
		}
	}
})();
