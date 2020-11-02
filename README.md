# protractor-gen

## Backstory

So, I bought my holy-grail turntable (SONY PS-8750) and wanted to calibrate it properly. I looked for alignment protractors on-line, but could not find any with reasonable price and shipping time.

Instead of waiting, I thought "how complex can it be", turn's out it's not that complicated, just some trigonometry, so I spent a few hours to create this generator.


## The generator

The generator generates a printable PDF file, and only requires 3 values specific to the turntable/tonearm as input:

- Pivot to spindle length (mm) - This is the distance from the center of the spindle (the pin in the center of the turntable) to the pivot point of the tonearm.
- Stylus overhang (mm) - Determines how far past the spindle the cartridge (specifically the stylus) overhangs the spindle.
- Offset angle (degrees) - The angle of the cartridge.


## Instructions for non-developers

- Install nodejs from [https://nodejs.org].
- Download the .zip (click the green "Code" button above to get a dowload link).
- Unzip into a local folder.
- Open a command prompt and `cd` into the folder (e.g. `cd c:\myfolder`).
- Install dependencies:
```
npm install
```
- Run the generator:

```
node index.js -turntable "SONY PS-8750" -tonearm "SONY PUA-1600S" -pts 222 -oh 15 -oa 21.5 -o "SONY PS-8750.pdf"
```

Running this will output a pdf like this:

![](example-A4.jpg?raw=true)


## Page sizes

The generator supports multiple page-sizes, A4 is the default size but other sizes can be specified as well. A3 will provide a "full size" protractor:

```
node index.js -turntable "SONY PS-8750" -tonearm "SONY PUA-1600S" -pts 222 -oh 15 -oa 21.5 -ps A3 -o "SONY PS-8750.pdf"
```

Running this will output a pdf like this:

![](example-A3.jpg?raw=true)


## Dealing with printer scale issues

The generated pdf includes measurements points that you should verify on a printed copy of the protractor. Some printers will not print the pdf in the correct scale. The horizontal distance between the measuring points should be exactly 190mm and 260mm between the vertical ones. If the actual measured distance is of you can scale the output file by using the `-sx` and `-sy` parameters.

## Instructions for developers

You know how this works, send me PR's with improvements :)
