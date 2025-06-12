//---------------------------------------------------------------------
// JavaScript-HTML5 QRCode Generator
//
// Copyright (c) 2011 Amanuel Tewolde
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
//---------------------------------------------------------------------

// Generates a QRCode of text provided.
// First QRCode is rendered to a canvas.
// The canvas is then turned to an image PNG
// before being returned as an <img> tag.
function showQRCode(text) {
  var dotsize = 3,
      padding = 10,
      black = "rgb(0,0,0)",
      white = "rgb(255,255,255)",
      ecLevel = QRErrorCorrectLevel.L,
      version = 10,               // ← max version
      qr;

  // skip auto-detect, always use v40
  qr = new QRCode(version, ecLevel);
  qr.addData(text);
  qr.make();

  var qrsize = qr.getModuleCount(),
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d"),
      shift = padding/2;

  canvas.width = canvas.height = qrsize * dotsize + padding;
  for (var r=0; r<qrsize; r++) {
    for (var c=0; c<qrsize; c++) {
      ctx.fillStyle = qr.isDark(r,c) ? black : white;
      ctx.fillRect(c*dotsize + shift, r*dotsize + shift, dotsize, dotsize);
    }
  }

  var img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  return img;
}