const PDFDocument = require("pdfkit");
const fs = require("fs");


function mmToPts(mm) {
    return mm * 72.0 / 25.4;
}

const FONT_SIZE_SMALL = mmToPts(2.5);
const FONT_SIZE_NORMAL = mmToPts(4);
const FONT_SIZE_LARGE = mmToPts(5);

function degToRad(deg) {
    return deg * (Math.PI/180.0);
}

function radToDeg(rad) {
    return rad * (180/Math.PI);
}

function calculateNulls(angle, b, c) {
    // law of cosines
    return {
        inner: b * Math.cos(angle) - Math.sqrt(c * c - b * b * Math.sin(angle) * Math.sin(angle)),
        outer: b * Math.cos(angle) + Math.sqrt(c * c - b * b * Math.sin(angle) * Math.sin(angle))
    };
}

function calculateAngleOfTriangle(a, b, c) {
    // law of cosines
    return Math.acos((a * a + b * b - c * c)/(2 * a * b));
}

function calculateTrackingErrorAndTHD(pivotToSpindle, stylusOverhang, offsetAngle) {
    const effectiveLength = pivotToSpindle + stylusOverhang;

    const ret = {
        labels: [],
        error: [],
        thd: []
    }

    for (var mm=50; mm<=150; mm++) {
        const diff = 90 - offsetAngle - radToDeg(calculateAngleOfTriangle(mm, effectiveLength, pivotToSpindle));
        const trackingError = Math.abs(diff);

        // Hd ≈ (ω . A . α ) / (ωr . r )
        // ω = angular frequency of the modulation
        // A = amplitude
        // α = tracking error
        // ωr = angular frequency of rotation (speed of record in radians/sec), 33rpm = 3.49 radians/sec
        // r = radius of the groove

        const hd = (180 * trackingError) / (3.49 * mm); // the 180 is a "magic constant", don't know (yet) how to derive it :(

        ret.labels.push(mm % 10 == 0?'' + mm:null);
        ret.error.push(diff);
        ret.thd.push(hd);
    }

    return ret;
}

function drawArrow(doc, point, angle, color) {
    doc
        .save()
        .translate(point.x, point.y)
        .rotate(radToDeg(angle))
        .polygon([0, 0], [mmToPts(1.25), mmToPts(-3)], [mmToPts(-1.25), mmToPts(-3)])
        .fill(color || 'black')
        .restore();
}

function drawGrid(doc, center, angle, offsetAngle) {
    const size = 26;
    doc
        .save()
        .rotate(radToDeg(angle), { origin: [center.x, center.y]})
        .strokeColor('black')
        .lineWidth(mmToPts(0.05));

    // vertical lines (1mm spacing)
    for (var offset=-size; offset<=size; offset+=1) {
        doc
            .moveTo(center.x + mmToPts(offset), center.y - mmToPts(size))
            .lineTo(center.x + mmToPts(offset), center.y + mmToPts(size));
    }

    // horizontal lines (2mm spacing)
    for (var offset=-size; offset<=size; offset+=2) {
        doc
            .moveTo(center.x - mmToPts(size), center.y + mmToPts(offset))
            .lineTo(center.x + mmToPts(size), center.y + mmToPts(offset));
    }

    doc
        .stroke()

        // circle
        .circle(center.x, center.y, mmToPts(1.5))
        .stroke()

        // red "forward line"
        .moveTo(center.x, center.y)
        .lineTo(center.x - mmToPts(size * 2), center.y)
        .lineWidth(mmToPts(0.2))
        .strokeColor('red')
        .stroke()

        // blue "backwards line"
        .moveTo(center.x, center.y)
        .lineTo(center.x + mmToPts(size * 2), center.y)
        .lineWidth(mmToPts(0.2))
        .strokeColor('blue')
        .stroke()
        ;

    const arcTopX = Math.cos(degToRad(offsetAngle + 10)) * 100;
    const arcTopY = -1 * Math.sin(degToRad(offsetAngle + 10)) * 100;
    const arcBottomX = Math.cos(degToRad(10)) * 100;
    const arcBottomY = Math.sin(degToRad(10)) * 100;

    doc
        // offset angle arc
        .translate(center.x, center.y)
        .path('M 100,0 A 100,100 0 0 0 ' + arcTopX + ',' + arcTopY)
        .path('M 100,0 A 100,100 0 0 1 ' + arcBottomX + ',' + arcBottomY)
        .stroke()
        ;


    drawArrow(doc, {x: 100, y: 0}, degToRad(180), 'blue');
    drawArrow(doc, {x: 100 * Math.cos(degToRad(offsetAngle)), y: -1 * 100 * Math.sin(degToRad(offsetAngle))}, degToRad(-offsetAngle), 'blue');

    doc
        .fillColor('blue')
        .fontSize(FONT_SIZE_NORMAL)
        .rotate(-offsetAngle/2)
        .text(offsetAngle + '°', 100 + mmToPts(2), -doc.heightOfString('X')/3)
        .restore()
        ;
}

function drawTrackingErrorChart(doc, bounds, chartData, grooves, nulls) {
    doc
        .rect(bounds.x, bounds.y, bounds.w, bounds.h)
        .fill('white')
        ;

    drawChartGroovesAndNulls(doc, bounds, grooves, nulls);
    // draw line instead of x-axis (we share it with the other chart)
    doc
        .moveTo(bounds.x, bounds.y + bounds.h)
        .lineTo(bounds.x + bounds.w, bounds.y + bounds.h)
        .stroke('black')
        ;

    drawChartYAxis(doc, bounds,
        [null, '-1.0', null, '0.0', null, '1.0', null, '2.0', null, '3.0']
    );
    drawChartMainArea(doc, bounds, chartData, 'error', 'tracking error (°)', -1.5, 3.0);
}

function drawTHDChart(doc, bounds, chartData, grooves, nulls) {
    doc
        .rect(bounds.x, bounds.y, bounds.w, bounds.h)
        .fill('white')
        ;

    drawChartGroovesAndNulls(doc, bounds, grooves, nulls);
    drawChartXAxis(doc, bounds, chartData);
    drawChartYAxis(doc, bounds,
        ['0.0', null, '0.2', null, '0.4', null, '0.6', null, '0.8', null, '1.0', null, '1.2', null, '1.4', null]
    );
    drawChartMainArea(doc, bounds, chartData, 'thd', 'tracking distortion (%)', 0.0, 1.5);
}

function drawChartLegends(doc, bounds, chartData) {
    doc
        .save()
        .translate(bounds.x, bounds.y)
        .rect(0, 0, bounds.w, bounds.h)
        .fill('white')
        // .fillAndStroke('white', '#bbb')
        ;

    const xstep = bounds.w/(chartData.length);
    for (var i=0; i<chartData.length; i++) {
        const data = chartData[i];
        doc
            .moveTo(i * xstep + mmToPts(2), bounds.h/2)
            .lineTo(i * xstep + mmToPts(6), bounds.h/2)
            .lineWidth(i == 0?mmToPts(0.8):mmToPts(0.05))
            .stroke(data.color)
            .fontSize(FONT_SIZE_SMALL)
            .fillColor('black')
            .text(data.name, i * xstep + mmToPts(7), bounds.h/2 - doc.heightOfString(data.name)/3)
            .fill()
            ;

    }

    doc
        .restore()
        ;
}

function drawChartGroovesAndNulls(doc, bounds, grooves, nulls) {
    doc
        .save()
        .translate(bounds.x, bounds.y)
        ;

    // here we're assuming the x axis is from 50 -> 150
    const minx = 50;
    const maxx = 150;
    const xstep = bounds.w/(maxx - minx - 1);

    doc
        .rect(0, 0, xstep * (grooves.inner - minx), bounds.h)
        .rect(xstep * (grooves.outer - minx), 0, bounds.w - xstep * (grooves.outer - minx), bounds.h)
        .fill('#ddd')
        .moveTo(xstep * (nulls.inner - minx), 0)
        .lineTo(xstep * (nulls.inner - minx), bounds.h)
        .moveTo(xstep * (nulls.outer - minx), 0)
        .lineTo(xstep * (nulls.outer - minx), bounds.h)
        .stroke('#bbb')
        .restore()
        ;
}

function drawChartMainArea(doc, bounds, chartData, field, title, miny, maxy) {
    doc
        .save()
        .translate(bounds.x, bounds.y)
        .rect(0, 0, bounds.w, bounds.h)
        .clip()
        ;

    const xstep = bounds.w / (chartData[0][field].length - 1);

    for (var i=chartData.length-1; i>=0; i--) {  // reverse, to make sure idx=0 is drawn on top of the others
        const data = chartData[i];
        var drawing = false;
        for (var j=0; j<data.error.length; j++) {
            const x = j * xstep;
            const y = bounds.h - (data[field][j] - miny) * bounds.h / (maxy - miny);

            if (!drawing) {
                doc.moveTo(x, y);
                drawing = true;
            }
            else {
                doc.lineTo(x, y);
            }
        }

        doc.lineWidth(i == 0?mmToPts(0.8):mmToPts(0.05));
        doc.stroke(data.color);
    }

    doc
        .fillColor('black')
        .fontSize(FONT_SIZE_NORMAL)
        .text(title, (bounds.w - doc.widthOfString(title))/2, mmToPts(3))
        .restore()
        ;
}

function drawChartXAxis(doc, bounds, chartData) {
    doc
        .save()
        .translate(bounds.x, bounds.y)
        .fontSize(FONT_SIZE_SMALL)
        .strokeColor('black')
        .fillColor('black')
        ;

    const data = chartData[0];
    const xstep = bounds.w / (data.labels.length - 1);
    const y = bounds.h;

    for (var i=0; i<data.labels.length; i++) {
        doc
            .moveTo(xstep * i, y - mmToPts(1))
            .lineTo(xstep * i, y)
            ;

        if (data.labels[i]) {
            doc
                .text(data.labels[i], xstep * i - doc.widthOfString(data.labels[i])/2, y + mmToPts(1))
                ;
        }
    }

    const label = 'groove radius (mm)';

    doc
        .text(label, bounds.w - doc.widthOfString(label), y + mmToPts(3))
        .moveTo(0, y)
        .lineTo(bounds.w, y)
        .stroke()
        .restore()
        ;
}

function drawChartYAxis(doc, bounds, labels) {
    doc
        .save()
        .translate(bounds.x, bounds.y)
        .fontSize(FONT_SIZE_SMALL)
        .fillColor('black')
        ;

    const x = 0;
    const ystep = bounds.h / (labels.length - 1);

    // labels with horizontal lines
    for (var i=0; i<labels.length; i++) {
        if (labels[i]) {
            doc
                .text(labels[i], 0 - doc.widthOfString(labels[i]) - mmToPts(1), bounds.h - i * ystep - doc.heightOfString(labels[i])/3)
                .moveTo(x, bounds.h - i * ystep)
                .lineTo(bounds.w, bounds.h - i * ystep)
                ;
        }
    }

    doc
        .stroke('#bbb')
        ;

    // ticks
    for (var i=0; i<labels.length; i++) {
        doc
            .moveTo(x, bounds.h - i * ystep)
            .lineTo(x + mmToPts(1), bounds.h - i * ystep)
            ;
    }

    doc
        .moveTo(x, bounds.h)
        .lineTo(x, 0)
        .stroke('black')
        ;

    doc
        .restore()
        ;
}

function drawTitle(doc, center) {
    const title = 'Cartridge Alignment Protractor';

    doc
        .fontSize(FONT_SIZE_LARGE)
        .rect(center.x - doc.widthOfString(title)/2, center.y, doc.widthOfString(title), doc.heightOfString(title))
        .fill('white')
        .fillColor('black')
        .text(title, center.x - doc.widthOfString(title)/2, center.y)
}

function drawInfoArea(doc, bounds, spec, computed) {
    const col0 = 0;
    const col1 = mmToPts(35);
    var y = 0;

    doc
        .save()
        .translate(bounds.x, bounds.y)
        .rect(0, 0, bounds.w, bounds.h)
        .fill('white')
        .fillColor('black')
        .fontSize(FONT_SIZE_NORMAL)

        .text('Turntable:', col0, mmToPts(y))
        .fontSize(FONT_SIZE_LARGE)
        .text(spec.turntable, col0, mmToPts((y += 5)))

        .fontSize(FONT_SIZE_NORMAL)
        .text('Tonearm:', col0, mmToPts((y += 10)))
        .fontSize(FONT_SIZE_LARGE)
        .text(spec.tonearm, col0, mmToPts((y += 5)))

        .fontSize(FONT_SIZE_NORMAL)
        .text('Pivot to spindle:', col0, mmToPts((y += 10)))
        .text(spec.pivotToSpindle + ' mm', col1, mmToPts(y))
        .text('Stylus overhang:', col0, mmToPts((y += 5)))
        .text(spec.stylusOverhang + ' mm', col1, mmToPts(y))
        .text('Offset angle:', col0, mmToPts((y += 5)))
        .text(spec.offsetAngle + '°', col1, mmToPts(y))

        .text('Effective length:', col0, mmToPts((y += 10)))
        .text(computed.effectiveLength + ' mm', col1, mmToPts(y))
        .text('Inner null:', col0, mmToPts((y += 5)))
        .text(computed.nulls.inner.toFixed(2) + ' mm', col1, mmToPts(y))
        .text('Outer null:', col0, mmToPts((y += 5)))
        .text(computed.nulls.outer.toFixed(2) + ' mm', col1, mmToPts(y))

        .fontSize(FONT_SIZE_SMALL)
        .text('Generated by protractor-gen', col0, mmToPts((y += 10)))
        .text('© 2020 Bjarni Ivarsson', col0, mmToPts((y += 3)))
        .text('https://github.com/bjarniivarsson/protractor-gen', col0, mmToPts((y += 3)))

        .fill()
        .restore()
    }

function main(spec) {

    const computed = {
        effectiveLength: spec.pivotToSpindle + spec.stylusOverhang,
        nulls: calculateNulls(degToRad(90 - spec.offsetAngle), spec.pivotToSpindle + spec.stylusOverhang, spec.pivotToSpindle)
    }

    const grooves = {
        inner: 57.5,  // IEC=60.325, DIN=57.5
        outer: 146.05 // IEC and DIN
    }

    console.log(
        'inputs:' +
        '\npivot to spindle : ' + spec.pivotToSpindle + ' mm' +
        '\nstylus overhang  : ' + spec.stylusOverhang + ' mm' +
        '\noffset angle     : ' + spec.offsetAngle + '°' +
        '\n\ncomputed:' +
        '\neffective length : ' + computed.effectiveLength + ' mm' +
        '\ninner null       : ' + computed.nulls.inner + ' mm' +
        '\nouter null       : ' + computed.nulls.outer + ' mm' +
        '\n'
    );

    const doc = new PDFDocument({size: spec.pageSize});
    doc.pipe(fs.createWriteStream(spec.outputFile));

    doc.scale(spec.scaleX, spec.scaleY);

    // layout
    const lineWidth = mmToPts(0.05);
    const bounds = {
        x: 0,
        y: 0,
        w: doc.page.width,
        h: doc.page.height
    }
    const spindle = {
        x: doc.page.width/2,
        y: doc.page.height/2 - mmToPts(15)
        // x: bounds.w/2,
        // y: bounds.h/2 - mmToPts(15)
    }

    // angle to the arm pivot point from horizontal
    const armAngle = calculateAngleOfTriangle(spec.pivotToSpindle, computed.nulls.inner, computed.effectiveLength) - degToRad(90);
    const armPivot = {
        x: spindle.x + mmToPts(spec.pivotToSpindle * Math.cos(armAngle)), // todo
        y: spindle.y - mmToPts(spec.pivotToSpindle * Math.sin(armAngle))  // todo
    }

    // angle from the arm pivot point to where the arm intersects the inner null
    const armInnerNullAngle = calculateAngleOfTriangle(spec.pivotToSpindle, computed.effectiveLength, computed.nulls.inner);

    // angle from the arm pivot point to where the arm intersect the outer null
    const armOuterNullAngle = calculateAngleOfTriangle(spec.pivotToSpindle, computed.effectiveLength, computed.nulls.outer);

    // point where arm touches inner null
    const armInnerNull = {
        x: armPivot.x - mmToPts(computed.effectiveLength * Math.cos(armAngle + armInnerNullAngle)),
        y: armPivot.y + mmToPts(computed.effectiveLength * Math.sin(armAngle + armInnerNullAngle))
    }

    // point where arm touches outer null
    const armOuterNull = {
        x: armPivot.x - mmToPts(computed.effectiveLength * Math.cos(armAngle + armOuterNullAngle)),
        y: armPivot.y + mmToPts(computed.effectiveLength * Math.sin(armAngle + armOuterNullAngle))
    }

    doc
        .fontSize(FONT_SIZE_NORMAL)
        .lineWidth(lineWidth)

        // inner/outer groove
        .circle(spindle.x, spindle.y, mmToPts(grooves.inner)) // IEC=60.325, DIN=57.5
        .circle(spindle.x, spindle.y, mmToPts(grooves.outer))
        .dash(5, {space: 10})
        .stroke()
        .undash()

        // spindle
        .circle(spindle.x, spindle.y, mmToPts(7.3/2)) // standard LP (12") hole diameter

        // vertical/horizontal lines through spindle
        .moveTo(spindle.x, bounds.y)
        .lineTo(spindle.x, bounds.h)
        .moveTo(bounds.x, spindle.y)
        .lineTo(bounds.w, spindle.y)

        // inner/outer null
        .circle(spindle.x, spindle.y, mmToPts(computed.nulls.inner))
        .circle(spindle.x, spindle.y, mmToPts(computed.nulls.outer))

        // needle arc
        .circle(armPivot.x, armPivot.y, mmToPts(computed.effectiveLength))

        // arm to spindle
        .moveTo(armPivot.x, armPivot.y)
        .lineTo(armPivot.x - mmToPts(computed.effectiveLength * Math.cos(armAngle)), armPivot.y + mmToPts(computed.effectiveLength * Math.sin(armAngle)))

        // arm to inner null
        .moveTo(armPivot.x, armPivot.y)
        // .lineTo(armPivot.x - mmToPts(effectiveLength * Math.cos(armAngle + armSweepInner)), armPivot.y + mmToPts(effectiveLength * Math.sin(armAngle + armSweepInner)))
        .lineTo(armInnerNull.x, armInnerNull.y)

        // arm to outer null
        .moveTo(armPivot.x, armPivot.y)
        .lineTo(armPivot.x - mmToPts(computed.effectiveLength * Math.cos(armAngle + armOuterNullAngle)), armPivot.y + mmToPts(computed.effectiveLength * Math.sin(armAngle + armOuterNullAngle)))

        // spindle to outer null/arm intersection point
        .moveTo(spindle.x, spindle.y)
        .lineTo(armOuterNull.x, armOuterNull.y)

        .stroke()
        ;

    // inner null arrow
    arrows = [
        {
            origin: spindle,
            angle: degToRad(160),
            distance: mmToPts(computed.nulls.inner),
            name: 'Inner null'
        },
        {
            origin: spindle,
            angle: degToRad(153),
            distance: mmToPts(computed.nulls.outer),
            name: 'Outer null'
        },
        {
            origin: spindle,
            angle: degToRad(140),
            distance: mmToPts(grooves.inner),
            name: 'Inner groove'
        },
        {
            origin: spindle,
            angle: degToRad(133),
            distance: mmToPts(grooves.outer),
            name: 'Outer groove'
        }
    ];

    for (var i=0; i<arrows.length; i++) {
        const arrow = arrows[i];
        const point = {
            x: arrow.origin.x + arrow.distance * Math.cos(arrow.angle),
            y: arrow.origin.y + arrow.distance * Math.sin(arrow.angle)
        }
        doc
            .moveTo(arrow.origin.x, arrow.origin.y)
            .lineTo(point.x, point.y)
            .stroke('#666')
            ;

        drawArrow(doc, point, arrow.angle - degToRad(90), 'black');

        doc
            .save()
            .translate(point.x, point.y)
            .rotate(radToDeg(arrow.angle) - 180)
            .fontSize(FONT_SIZE_SMALL)
            .fillColor('black')
            .text(arrow.name, mmToPts(5), -doc.heightOfString('X'))

            .restore();
    }

    // cartridge alignment grids
    drawGrid(doc, armInnerNull, 0, spec.offsetAngle);
    drawGrid(doc, armOuterNull, -1 * Math.asin((armOuterNull.x - spindle.x) / mmToPts(computed.nulls.outer)), spec.offsetAngle);

    const parameters = [
        {
            name: spec.turntable,
            color: 'orange',
            pivotToSpindle: spec.pivotToSpindle,
            stylusOverhang: spec.stylusOverhang,
            offsetAngle: spec.offsetAngle
        },
        {
            name: 'Lofgren A',
            color: '#3333ff',
            pivotToSpindle: 222,
            stylusOverhang: 17.3,
            offsetAngle: 22.99
        },
        {
            name: 'Lofgren B',
            color: '#ff3333',
            pivotToSpindle: 222,
            stylusOverhang: 17.75,
            offsetAngle: 22.94
        },
        {
            name: 'Stevenson',
            color: '#33ff33',
            pivotToSpindle: 222,
            stylusOverhang: 15.42,
            offsetAngle: 21.98
        }
    ]

    const chartData = []
    for (var i=0; i<parameters.length; i++) {
        const data = calculateTrackingErrorAndTHD(parameters[i].pivotToSpindle, parameters[i].stylusOverhang, parameters[i].offsetAngle);
        data.name = parameters[i].name;
        data.color = parameters[i].color;
        chartData.push(data);
    }

    drawTitle(doc, { x: spindle.x, y: spindle.y - mmToPts(123)});
    drawInfoArea(doc, { x: spindle.x - mmToPts(95), y: spindle.y - mmToPts(100), w: mmToPts(58), h: mmToPts(80)}, spec, computed);
    drawTrackingErrorChart(doc, { x: spindle.x - mmToPts(30), y: spindle.y - mmToPts(108), w: mmToPts(125), h: mmToPts(45)}, chartData, grooves, computed.nulls);
    drawTHDChart(doc, { x: spindle.x - mmToPts(30), y: spindle.y - mmToPts(63), w: mmToPts(125), h: mmToPts(45)}, chartData, grooves, computed.nulls);
    drawChartLegends(doc, { x: spindle.x - mmToPts(30), y: spindle.y - mmToPts(12), w: mmToPts(125), h: mmToPts(4)}, chartData);

    // drawTitleArea(doc, { x: mmToPts(10), y: mmToPts(30), w: mmToPts(58), h: mmToPts(65)}, spec, computed);
    // drawTrackingErrorChart(doc, { x: mmToPts(75), y: mmToPts(25), w: mmToPts(125), h: mmToPts(45)}, chartData, grooves, computed.nulls);
    // drawTHDChart(doc, { x: mmToPts(75), y: mmToPts(70), w: mmToPts(125), h: mmToPts(45)}, chartData, grooves, computed.nulls);
    // drawChartLegends(doc, { x: mmToPts(75), y: mmToPts(121), w: mmToPts(125), h: mmToPts(4)}, chartData);

    const calibrationCross = {
        x: spindle.x + mmToPts(95),
        y: spindle.y - mmToPts(123)
    }

    doc
        .strokeColor('black')
        .fillColor('black')
        .fontSize(FONT_SIZE_SMALL)

        // top right cross
        .moveTo(calibrationCross.x, calibrationCross.y - mmToPts(3))
        .lineTo(calibrationCross.x, calibrationCross.y + mmToPts(3)) // vertical
        .moveTo(calibrationCross.x - mmToPts(3), calibrationCross.y)
        .lineTo(calibrationCross.x + mmToPts(3), calibrationCross.y) // horizontal

        // bottom right cross
        .moveTo(calibrationCross.x, calibrationCross.y + mmToPts(257))
        .lineTo(calibrationCross.x, calibrationCross.y + mmToPts(263)) // vertical
        .moveTo(calibrationCross.x - mmToPts(3), calibrationCross.y + mmToPts(260))
        .lineTo(calibrationCross.x + mmToPts(3), calibrationCross.y + mmToPts(260)) // horizontal

        // top left cross
        .moveTo(calibrationCross.x - mmToPts(190), calibrationCross.y - mmToPts(3))
        .lineTo(calibrationCross.x -  mmToPts(190), calibrationCross.y + mmToPts(3)) // vertical
        .moveTo(calibrationCross.x - mmToPts(193), calibrationCross.y)
        .lineTo(calibrationCross.x - mmToPts(187), calibrationCross.y) // horizontal

        // horizontal text
        .text('190mm', calibrationCross.x - mmToPts(1) - doc.widthOfString('190mm'), calibrationCross.y - mmToPts(3))

        // vertical text
        .save()
        .translate(calibrationCross.x, calibrationCross.y)
        .rotate(90)
        .text('260mm', mmToPts(1), -1 * doc.heightOfString('260mm'))
        .restore()

        .fillAndStroke()
        .end();
}

function help() {
    console.log('Turntable alignment protractor generator.\n');
    console.log('Supported args:');
    console.log('  -turntable NAME - turntable name');
    console.log('  -tonearm NAME   - tonearm name');
    console.log('  -pts LENGTH     - pivot to spindle length (in mm)');
    console.log('  -oh LENGTH      - stylus overhang (in mm)');
    console.log('  -oa ANGLE       - stylus offset angle (in °)');
    console.log('  -o FILENAME     - output filename (pdf file)');
    console.log('  -ps PAGESIZE    - page size to use (e.g. A4, A3, LETTER)');
    console.log('  -sx SCALE       - scaling factor for x-axis');
    console.log('  -sy SCALE       - scaling factoryfor y-axis');
    console.log();
}

// const spec = {
//     turntable: 'SONY PS-8750',
//     tonearm: 'SONY PUA-1600S',
//     pivotToSpindle: 222.0,
//     stylusOverhang: 15.0,
//     offsetAngle: 21.5,
//     pageSize: 'A3',
//     scaleX: 1.0,
//     scaleY: 1.0
// }

const spec = {
    turntable: null,
    tonearm: null,
    pivotToSpindle: null,
    stylusOverhang: null,
    offsetAngle: null,
    outputFile: null,
    pageSize: 'A4',
    scaleX: 1.0,
    scaleY: 1.0
}

var args = process.argv.slice(2);
const missingParams = ['-turntable', '-tonearm', '-pts', '-oh', '-oa', '-o'];

while (args.length) {
    switch (args[0]) {
        case '-h':
        case '--help':
            help();
            process.exit();
        case '-turntable':
            spec.turntable = args[1];
            break;
        case '-tonearm':
            spec.tonearm = args[1];
            break;
        case '-pts':
            spec.pivotToSpindle = parseFloat(args[1])
            break;
        case '-oh':
            spec.stylusOverhang = parseFloat(args[1])
            break;
        case '-oa':
            spec.offsetAngle = parseFloat(args[1]);
            break;
        case '-o':
            spec.outputFile = args[1];
            break;
        case '-ps':
            spec.pageSize = args[1];
            break;
        case '-sx':
            spec.scaleX = parseFloat(args[1]);
            break;
        case '-sy':
            spec.scaleY = parseFloat(args[1]);
            break;
        default:
            help();
            console.log('Unsupported paramere: ' + args[0]);
            console.log();
            process.exit();
    }

    if (missingParams.indexOf(args[0]) != -1) {
        missingParams.splice(missingParams.indexOf(args[0]), 1);
    }
    args = args.slice(2);
}

if (missingParams.length) {
    help();
    for (var i=0; i<missingParams.length; i++) {
        console.log('missing required parameter: ' + missingParams[i]);
    }
    console.log();
    process.exit();
}


main(spec);
