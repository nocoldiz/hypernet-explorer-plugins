/*:
 * @target MZ
 * @plugindesc Generates the procedural battle effect animations drawn over the battlers.
 * @author Omni-Lex
 *
 * @help
 * Draws the generated battle effects (wavy lines, bursts, sweeps) into the
 * animation bitmaps the battle scene plays. No parameters and no plugin
 * commands: the battle system calls it.
 */

(() => {
  function drawWavyLines() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var lineSpacing = h / this._numLines;

    // Batch path operations
    context.lineWidth = 3;

    for (var i = 0; i < this._numLines; i++) {
      // Alternate colors
      context.strokeStyle =
        i % 2 === 0
          ? this.hueToColor(this._colorHue1)
          : this.hueToColor(this._colorHue2);

      context.beginPath();

      // Reduce points for performance
      var step = 10; // Increased from 5
      for (var x = 0; x <= w; x += step) {
        var y =
          i * lineSpacing +
          Math.sin(
            x * this._waveFrequency +
            this._animationCount * this._waveSpeed +
            i * 0.3
          ) *
          this._waveAmplitude;

        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
    }
  }

  function drawSpiral() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var centerX = w / 2;
    var centerY = h / 2;
    var maxRadius = Math.sqrt(w * w + h * h) / 2;

    // Rotation based on animation count
    var rotation =
      (this._animationCount * this._spiralRotationSpeed * Math.PI) / 180;

    // Batch fill operations
    context.save();

    for (var radius = 20; radius < maxRadius; radius += 40) {
      // Increased step
      var segments = this._spiralSegments;
      var segmentAngle = (Math.PI * 2) / segments;

      for (var i = 0; i < segments; i++) {
        var startAngle = i * segmentAngle + rotation;
        var endAngle = startAngle + segmentAngle / 2;

        // Alternate colors
        context.fillStyle =
          i % 2 === 0
            ? this.hueToColor(this._colorHue1)
            : this.hueToColor(this._colorHue2);

        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, radius, startAngle, endAngle);
        context.closePath();
        context.fill();
      }
    }

    context.restore();
  }


  function drawArcaneSeal() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var centerX = w / 2;
    var centerY = h / 2;
    var maxRadius = Math.min(w, h) * 0.4;

    var rotation =
      (this._animationCount * this._arcaneRotationSpeed * Math.PI) / 180;

    // Draw all circles first
    context.strokeStyle = this.hueToColor(this._colorHue1);
    context.lineWidth = 2;

    for (var i = 0; i < this._arcaneRings; i++) {
      var radius = (maxRadius * (i + 1)) / this._arcaneRings;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }

    // Then draw all symbols
    context.fillStyle = this.hueToColor(this._colorHue2);

    for (var i = 0; i < this._arcaneRings; i++) {
      var radius = (maxRadius * (i + 1)) / this._arcaneRings;
      var ringRotation = rotation * (i % 2 === 0 ? 1 : -1);

      for (var j = 0; j < this._arcaneSymbols; j++) {
        var angle = (j / this._arcaneSymbols) * Math.PI * 2 + ringRotation;
        var x = centerX + Math.cos(angle) * radius;
        var y = centerY + Math.sin(angle) * radius;

        context.beginPath();
        this.drawSymbol(context, x, y, 10, j % 4);
        context.fill();
      }
    }

    // Draw lines
    context.strokeStyle = this.hueToColor(this._colorHue3);
    context.lineWidth = 1;
    context.beginPath();

    for (var k = 0; k < this._arcaneSymbols; k++) {
      var angle1 = (k / this._arcaneSymbols) * Math.PI * 2 - rotation * 0.5;
      var angle2 = angle1 + Math.PI;

      var x1 = centerX + Math.cos(angle1) * maxRadius;
      var y1 = centerY + Math.sin(angle1) * maxRadius;
      var x2 = centerX + Math.cos(angle2) * maxRadius;
      var y2 = centerY + Math.sin(angle2) * maxRadius;

      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }

    context.stroke();
  }

  function drawCheckerboard() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var size = this._checkerSize;
    var time = this._animationCount * this._checkerScrollSpeed;

    // Apply rotation if needed
    if (this._checkerAngle !== 0) {
      context.save();
      context.translate(w / 2, h / 2);
      context.rotate((this._checkerAngle * Math.PI) / 180);
      context.translate(-w / 2, -h / 2);
    }

    var offsetX = (time * 10) % (size * 2);
    var offsetY = (time * 10) % (size * 2);

    // Draw larger rectangles to reduce draw calls
    for (var y = -size * 2; y < h + size * 2; y += size) {
      for (var x = -size * 2; x < w + size * 2; x += size) {
        var checkX = Math.floor((x + offsetX) / size);
        var checkY = Math.floor((y + offsetY) / size);

        if ((checkX + checkY) % 2 === 0) {
          context.fillStyle = this.hueToColor(this._colorHue1);
        } else {
          context.fillStyle = this.hueToColor(this._colorHue2);
        }

        context.fillRect(
          x + (offsetX % size),
          y + (offsetY % size),
          size,
          size
        );
      }
    }

    if (this._checkerAngle !== 0) {
      context.restore();
    }
  }

  function drawDiamondPattern() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var size = this._diamondSize;
    var time = this._animationCount * this._diamondSpeed;

    // Pre-calculate wave values. Separate caches for the X and Y axes so their
    // keys never collide (a single map with an x+1000 offset collided once the
    // bitmap height exceeded ~1000).
    var waveCacheX = {};
    var waveCacheY = {};

    // Only three distinct hues are ever used; build their colour strings once
    // instead of allocating a fresh "hsl(...)" string per diamond cell.
    var color1 = this.hueToColor(this._colorHue1);
    var color2 = this.hueToColor(this._colorHue2);
    var color3 = this.hueToColor(this._colorHue3);

    for (var y = -size; y < h + size; y += size) {
      for (var x = -size; x < w + size; x += size) {
        // Cache wave calculations
        if (!(y in waveCacheY)) {
          waveCacheY[y] = Math.sin(time + y * this._diamondWave) * size * 0.3;
        }
        if (!(x in waveCacheX)) {
          waveCacheX[x] =
            Math.cos(time + x * this._diamondWave) * size * 0.3;
        }

        var distX = waveCacheX[x];
        var distY = waveCacheY[y];

        // Diamond points
        var colorPhase = Math.sin(x * 0.01 + y * 0.01 + time) * 0.5 + 0.5;
        context.fillStyle =
          colorPhase < 0.33 ? color1 : colorPhase < 0.66 ? color2 : color3;
        context.beginPath();
        context.moveTo(x + distX, y + distY);
        context.lineTo(x + size / 2 + distX, y + size / 2 + distY);
        context.lineTo(x + distX, y + size + distY);
        context.lineTo(x - size / 2 + distX, y + size / 2 + distY);
        context.closePath();
        context.fill();
      }
    }
  }

  function drawConcentricCircles() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var centerX = w / 2;
    var centerY = h / 2;
    var maxRadius = Math.sqrt(w * w + h * h) / 2;

    var time = this._animationCount * this._circlePulseSpeed;
    var pulseScale = 1 + Math.sin(time) * this._circlePulseAmount;
    var rotation =
      (this._animationCount * this._circleRotationSpeed * Math.PI) / 180;

    // Draw all circles first
    for (var i = 0; i < this._circleCount; i++) {
      var baseRadius = (maxRadius / this._circleCount) * (i + 0.5);
      var radius = baseRadius * pulseScale;

      context.strokeStyle =
        i % 3 === 0
          ? this.hueToColor(this._colorHue1)
          : i % 3 === 1
            ? this.hueToColor(this._colorHue2)
            : this.hueToColor(this._colorHue3);

      context.lineWidth = 3 + (i % 3);
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }

    // Draw dots separately to reduce context switches
    for (var i = 0; i < this._circleCount; i++) {
      var baseRadius = (maxRadius / this._circleCount) * (i + 0.5);
      var radius = baseRadius * pulseScale;
      var dotsPerCircle = Math.min(6 + i, 12); // Cap dots for performance

      context.fillStyle =
        i % 3 === 0
          ? this.hueToColor(this._colorHue1)
          : i % 3 === 1
            ? this.hueToColor(this._colorHue2)
            : this.hueToColor(this._colorHue3);

      context.beginPath();
      for (var j = 0; j < dotsPerCircle; j++) {
        var dotAngle =
          (j / dotsPerCircle) * Math.PI * 2 + rotation * (i % 2 === 0 ? 1 : -1);
        var dotX = centerX + Math.cos(dotAngle) * radius;
        var dotY = centerY + Math.sin(dotAngle) * radius;
        var dotSize = 4 + (i % 3);

        context.moveTo(dotX + dotSize, dotY);
        context.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      }
      context.fill();
    }
  }

  function drawFlowingGrid() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var gridSize = this._gridSize;
    var time = this._animationCount * this._gridWaveSpeed;

    context.lineWidth = 2;

    // Draw horizontal lines with reduced points
    for (var y = 0; y < h; y += gridSize) {
      context.beginPath();
      context.strokeStyle =
        y % (gridSize * 2) === 0
          ? this.hueToColor(this._colorHue1)
          : this.hueToColor(this._colorHue2);

      var step = 20; // Increased step for performance
      for (var x = 0; x <= w; x += step) {
        var waveY = y + Math.sin(x * 0.01 + time) * this._gridWaveIntensity;

        if (x === 0) {
          context.moveTo(x, waveY);
        } else {
          context.lineTo(x, waveY);
        }
      }
      context.stroke();
    }

    // Draw vertical lines with reduced points
    for (var x = 0; x < w; x += gridSize) {
      context.beginPath();
      context.strokeStyle =
        x % (gridSize * 2) === 0
          ? this.hueToColor(this._colorHue2)
          : this.hueToColor(this._colorHue3);

      var step = 20; // Increased step for performance
      for (var y = 0; y <= h; y += step) {
        var waveX = x + Math.sin(y * 0.01 + time) * this._gridWaveIntensity;

        if (y === 0) {
          context.moveTo(waveX, y);
        } else {
          context.lineTo(waveX, y);
        }
      }
      context.stroke();
    }

    // Draw cells if not lines-only mode
    if (!this._gridLinesOnly) {
      context.fillStyle = this.hueToColor(this._colorHue3, 0.3);
      context.beginPath();

      for (var y = 0; y < h; y += gridSize * 2) {
        // Reduced density
        for (var x = 0; x < w; x += gridSize * 2) {
          if ((x + y) % (gridSize * 3) < gridSize) {
            var waveX = x + Math.sin(y * 0.01 + time) * this._gridWaveIntensity;
            var waveY = y + Math.sin(x * 0.01 + time) * this._gridWaveIntensity;
            var opacity = 0.2 + Math.abs(Math.sin(time + (x + y) * 0.01)) * 0.3;

            context.moveTo(waveX + gridSize / 4, waveY);
            context.arc(waveX, waveY, gridSize / 4, 0, Math.PI * 2);
          }
        }
      }

      context.fill();
    }
  }

  function drawPlaids() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var size = this._plaidSize;
    var time = this._animationCount * this._plaidSpeed;

    if (this._plaidRotation !== 0) {
      context.save();
      context.translate(w / 2, h / 2);
      context.rotate((this._plaidRotation * Math.PI) / 180);
      context.translate(-w / 2, -h / 2);
    }

    var hOffset = time % size;
    var vOffset = (time * 0.7) % size;

    // Batch horizontal stripes
    for (var i = 0; i < this._plaidHorizontalDensity; i++) {
      var subSize = size / this._plaidHorizontalDensity;
      context.fillStyle =
        i % 2 === 0
          ? this.hueToColor(this._colorHue1, 0.5)
          : this.hueToColor(this._colorHue2, 0.5);

      for (var y = -size + hOffset; y < h + size; y += size) {
        var yPos = y + i * subSize;
        context.fillRect(0, yPos, w, subSize * 0.7);
      }
    }

    // Batch vertical stripes
    for (var j = 0; j < this._plaidVerticalDensity; j++) {
      var vSubSize = size / this._plaidVerticalDensity;
      context.fillStyle =
        j % 2 === 0
          ? this.hueToColor(this._colorHue2, 0.5)
          : this.hueToColor(this._colorHue3, 0.5);

      for (var x = -size + vOffset; x < w + size; x += size) {
        var xPos = x + j * vSubSize;
        context.fillRect(xPos, 0, vSubSize * 0.7, h);
      }
    }

    if (this._plaidRotation !== 0) {
      context.restore();
    }
  }

  function drawKaleidoscope() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var centerX = w / 2;
    var centerY = h / 2;
    var radius = Math.min(w, h) * this._kaleidoscopeScale;

    var time = this._animationCount * this._kaleidoscopeRotationSpeed;
    var baseAngle = (time * Math.PI) / 180;
    var angleStep = (Math.PI * 2) / this._kaleidoscopeSegments;

    // Draw each segment
    for (var segment = 0; segment < this._kaleidoscopeSegments; segment++) {
      var angle = baseAngle + segment * angleStep;

      context.save();
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(
        centerX + Math.cos(angle) * radius * 2,
        centerY + Math.sin(angle) * radius * 2
      );
      context.lineTo(
        centerX + Math.cos(angle + angleStep) * radius * 2,
        centerY + Math.sin(angle + angleStep) * radius * 2
      );
      context.closePath();
      context.clip();

      // Batch draw circles in this segment
      for (var i = 0; i < this._kaleidoscopeCircles; i++) {
        var dist = radius * 0.3 + i * radius * 0.15;
        var circleAngle =
          angle + (i % 2 === 0 ? 1 : -1) * (time * 0.01 + i * 0.1);
        var cx = centerX + Math.cos(circleAngle) * dist;
        var cy = centerY + Math.sin(circleAngle) * dist;
        var size = 10 + i * 5;

        context.fillStyle =
          i % 3 === 0
            ? this.hueToColor(this._colorHue1)
            : i % 3 === 1
              ? this.hueToColor(this._colorHue2)
              : this.hueToColor(this._colorHue3);

        context.beginPath();
        context.arc(cx, cy, size, 0, Math.PI * 2);
        context.fill();

        // Inner circle
        context.fillStyle = this.hueToColor((this._colorHue1 + 180) % 360);
        context.beginPath();
        context.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    }
  }

  function drawFlowingDots() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var time = this._animationCount * this._dotSpeed;

    // Create a flowing dot field
    var spacing = this._dotSize * 3;

    // Only three distinct colours are used; build them once up front rather than
    // allocating a colour string per dot.
    var dotColor1 = this.hueToColor(this._colorHue1, 0.7);
    var dotColor2 = this.hueToColor(this._colorHue2, 0.7);
    var dotColor3 = this.hueToColor(this._colorHue3, 0.7);

    for (var y = 0; y < h + spacing; y += spacing) {
      for (var x = 0; x < w + spacing; x += spacing) {
        // Add movement
        var offsetX = Math.sin(y * 0.01 + time * 0.01) * spacing * 0.5;
        var offsetY = Math.cos(x * 0.01 + time * 0.01) * spacing * 0.5;

        var dotX = x + offsetX;
        var dotY = y + offsetY;

        // Color based on position
        var colorIndex =
          (Math.floor(x / spacing) + Math.floor(y / spacing)) % 3;

        // Size variation
        var sizeVar = Math.sin(x * 0.02 + y * 0.02 + time * 0.02) * 0.5 + 0.5;
        var size = this._dotSize * (0.5 + sizeVar);

        context.fillStyle =
          colorIndex === 0 ? dotColor1 : colorIndex === 1 ? dotColor2 : dotColor3;
        context.beginPath();
        context.arc(dotX, dotY, size, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawEnergyWaves() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var time = this._animationCount * this._waveSpeed;

    context.lineWidth = this._waveThickness;

    for (var i = 0; i < this._waveCount; i++) {
      var waveOffset = (i / this._waveCount) * Math.PI * 2;
      var color =
        i % 3 === 0
          ? this._colorHue1
          : i % 3 === 1
            ? this._colorHue2
            : this._colorHue3;

      context.strokeStyle = this.hueToColor(color);
      context.beginPath();

      // Create energy wave path
      for (var x = 0; x <= w; x += 10) {
        var y =
          h / 2 +
          Math.sin(x * 0.01 + time + waveOffset) *
          this._waveAmplitude *
          (1 + Math.sin(time * 0.5 + waveOffset) * 0.5);

        // Add secondary wave
        y +=
          Math.sin(x * 0.02 + time * 2 + waveOffset) *
          this._waveAmplitude *
          0.3;

        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
    }

    // Add glow effect
    context.globalAlpha = 0.3;
    context.lineWidth = this._waveThickness * 3;
    context.strokeStyle = this.hueToColor(this._colorHue1);

    for (var i = 0; i < this._waveCount; i++) {
      var waveOffset = (i / this._waveCount) * Math.PI * 2;

      context.beginPath();
      for (var x = 0; x <= w; x += 20) {
        var y =
          h / 2 + Math.sin(x * 0.01 + time + waveOffset) * this._waveAmplitude;

        if (x === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
    }

    context.globalAlpha = 1;
  }

  function drawCrystalLattice() {
    var w = this._currentBitmap.width;
    var h = this._currentBitmap.height;
    var context = this._currentContext;
    var size = this._crystalSize;
    var time = this._animationCount * this._crystalRotationSpeed;
    var centerX = w / 2;
    var centerY = h / 2;

    // Draw main lattice lines first
    for (var angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
      var rotatedAngle = angle + time;
      var endX = centerX + Math.cos(rotatedAngle) * (w * 0.75);
      var endY = centerY + Math.sin(rotatedAngle) * (h * 0.75);

      var colorIndex = Math.floor(((angle / (Math.PI * 2)) * 3) % 3);
      var colorHue =
        colorIndex === 0
          ? this._colorHue1
          : colorIndex === 1
            ? this._colorHue2
            : this._colorHue3;

      context.strokeStyle = this.hueToColor(colorHue);
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(endX, endY);
      context.stroke();
    }

    // Draw crystals in batches by color
    for (var colorIndex = 0; colorIndex < 3; colorIndex++) {
      var colorHue =
        colorIndex === 0
          ? this._colorHue1
          : colorIndex === 1
            ? this._colorHue2
            : this._colorHue3;

      context.fillStyle = this.hueToColor(colorHue, 0.5);
      context.strokeStyle = this.hueToColor(colorHue);
      context.lineWidth = 1;

      for (var angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
        if (Math.floor(((angle / (Math.PI * 2)) * 3) % 3) !== colorIndex)
          continue;

        var rotatedAngle = angle + time;

        for (
          var dist = size;
          dist < Math.sqrt(w * w + h * h) / 2;
          dist += size
        ) {
          var posX = centerX + Math.cos(rotatedAngle) * dist;
          var posY = centerY + Math.sin(rotatedAngle) * dist;

          if (
            posX < -size ||
            posX > w + size ||
            posY < -size ||
            posY > h + size
          )
            continue;

          var crystalSize =
            size * (0.5 + (dist / (Math.sqrt(w * w + h * h) / 2)) * 0.5);

          // Draw hexagon
          context.beginPath();
          for (var i = 0; i < 6; i++) {
            var pointAngle = (i * Math.PI) / 3 + rotatedAngle;
            var px = posX + Math.cos(pointAngle) * (crystalSize / 2);
            var py = posY + Math.sin(pointAngle) * (crystalSize / 2);

            if (i === 0) {
              context.moveTo(px, py);
            } else {
              context.lineTo(px, py);
            }
          }
          context.closePath();
          context.fill();
          context.stroke();
        }
      }
    }
  }

  function drawSymbol(context, x, y, size, type) {
    switch (type) {
      case 0: // Star
        for (var i = 0; i < 5; i++) {
          var angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          var x1 = x + size * Math.cos(angle);
          var y1 = y + size * Math.sin(angle);

          if (i === 0) {
            context.moveTo(x1, y1);
          } else {
            context.lineTo(x1, y1);
          }

          var innerAngle = angle + Math.PI / 5;
          var x2 = x + size * 0.4 * Math.cos(innerAngle);
          var y2 = y + size * 0.4 * Math.sin(innerAngle);
          context.lineTo(x2, y2);
        }
        context.closePath();
        break;

      case 1: // Circle
        context.arc(x, y, size / 2, 0, Math.PI * 2);
        break;

      case 2: // Triangle
        context.moveTo(x, y - size / 2);
        context.lineTo(x + size / 2, y + size / 2);
        context.lineTo(x - size / 2, y + size / 2);
        context.closePath();
        break;

      case 3: // Square
        context.rect(x - size / 2, y - size / 2, size, size);
        break;
    }
  }

  function drawPerformanceBackground() {
    if (!this._animatedBitmap) return;

    var w = this._animatedBitmap.width;
    var h = this._animatedBitmap.height;

    // Initialize random values on first run
    if (!this._perfBgInitialized) {
      this._perfBgInitialized = true;
      this._perfBaseHue1 = Math.floor(Math.random() * 360);
      this._perfBaseHue2 = Math.floor(Math.random() * 360);
      this._perfOriginalHue1 = this._perfBaseHue1;
      this._perfOriginalHue2 = this._perfBaseHue2;
      this._perfSpeedMultiplier = 0.8 + Math.random() * 0.7;
      this._perfDirection = Math.floor(Math.random() * 8);
      this._perfCellSize = 20 + Math.floor(Math.random() * 20);
      this._perfHueShiftRate = 0.02 + Math.random() * 0.04;
    }

    // Draw the gradient background first
    this._gradientBitmap.clear();
    var gradientContext = this._gradientBitmap._context;

    var time = this._animationCount * 0.02 * this._perfSpeedMultiplier;

    // Apply subtle oscillation to hues
    var oscAmount = 15;
    this._perfBaseHue1 =
      this._perfOriginalHue1 + Math.sin(time * 0.1) * oscAmount;
    this._perfBaseHue2 =
      this._perfOriginalHue2 + Math.sin(time * 0.1 + 1) * oscAmount;

    this._perfBaseHue1 = (this._perfBaseHue1 + 360) % 360;
    this._perfBaseHue2 = (this._perfBaseHue2 + 360) % 360;

    // Fill background
    gradientContext.fillStyle = this.hueToColor(this._perfBaseHue1, 1, 15);
    gradientContext.fillRect(0, 0, w, h);

    // Draw checkerboard
    var baseContext = this._animatedBitmap._context;
    this._animatedBitmap.clear();

    var cellSize = this._perfCellSize;
    var angleRad = (this._perfDirection * Math.PI) / 4;
    var offsetX = Math.floor(time * 15 * Math.cos(angleRad)) % cellSize;
    var offsetY = Math.floor(time * 15 * Math.sin(angleRad)) % cellSize;

    var color1 = this.hueToColor(this._perfBaseHue1, 0.7);
    var color2 = this.hueToColor(this._perfBaseHue2, 0.7);

    // Draw checkerboard pattern
    for (var y = -cellSize + offsetY; y < h + cellSize; y += cellSize) {
      for (var x = -cellSize + offsetX; x < w + cellSize; x += cellSize) {
        var isEvenRow = Math.floor(y / cellSize) % 2 === 0;
        var isEvenCol = Math.floor(x / cellSize) % 2 === 0;
        var useColor1 = (isEvenRow && isEvenCol) || (!isEvenRow && !isEvenCol);

        baseContext.fillStyle = useColor1 ? color1 : color2;
        baseContext.fillRect(x, y, cellSize, cellSize);
      }
    }

  }
  // 1. RGB Glitch Scanlines
  function drawRGBGlitch() {
    const w = this._currentBitmap.width;
    const h = this._currentBitmap.height;
    const ctx = this._currentContext;
    const time = this._animationCount * 0.1;
    const sliceCount = 12;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sliceCount; i++) {
      const y = (i * h) / sliceCount;
      const sliceH = h / sliceCount;
      const offset = Math.sin(time * 5 + i) * 8;
      // draw each color channel with an offset
      ['red', 'green', 'blue'].forEach((col, j) => {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = col;
        ctx.fillRect(offset * (j - 1), y, w, sliceH);
      });
    }
    ctx.restore();
  }

  // 2. Nebula Swirl (Perlin-style noise vortex)
  function drawNebulaSwirl() {
    const w = this._currentBitmap.width;
    const h = this._currentBitmap.height;
    const ctx = this._currentContext;
    const time = this._animationCount * 0.01; // Slower animation

    // Use canvas transforms instead of pixel manipulation
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.98; // Gentle fade

    // Create swirl from center
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.sin(time) * 0.02); // Subtle rotation
    ctx.scale(1.002, 1.002); // Slight zoom
    ctx.translate(-w / 2, -h / 2);

    // Redraw the canvas onto itself
    ctx.drawImage(this._currentBitmap.canvas, 0, 0);

    ctx.restore();
  }

  // 3. Warp Tunnel
  function drawWarpTunnel() {
    const w = this._currentBitmap.width;
    const h = this._currentBitmap.height;
    const ctx = this._currentContext;
    const time = this._animationCount * 0.03;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const rings = 20;
    for (let i = rings; i > 0; i--) {
      const t = (i / rings) + time % 1;
      const radius = t * Math.max(w, h);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.lineWidth = (1 - t) * 8;
      ctx.strokeStyle = this.hueToColor((this._colorHue1 + t * 120) % 360, 1, 50 + t * 50);
      ctx.globalAlpha = 1 - t;
      ctx.stroke();
    }
    ctx.restore();
  }

  window.EffectsGenerator = {
    drawWavyLines,
    drawSpiral,
    drawArcaneSeal,
    drawCheckerboard,
    drawDiamondPattern,
    drawConcentricCircles,
    drawFlowingGrid,
    drawPlaids,
    drawKaleidoscope,
    drawFlowingDots,
    drawEnergyWaves,
    drawCrystalLattice,
    drawSymbol,
    drawPerformanceBackground,
    drawRGBGlitch,
    drawNebulaSwirl,
    drawWarpTunnel
  };
})();
