# LUT Catalog Compatibility and Color Math Correctness

Snapshot checked on 2026-04-30 against the stable catalog snapshot current at
verification time.

- Catalog tag: `v2026.05.01`
- Catalog generated at: `2026-04-30T16:51:45.130Z`
- Entries checked: 70
- Entry metadata used: `entryUrl` JSON only. `.cube` files were not downloaded.

## Runtime Model

The export graph is scene-referred until the final JPEG encode:

1. Start in linear ProPhoto RGB / ROMM RGB.
2. Convert linear ProPhoto RGB to the LUT's declared input gamut.
3. Encode the LUT's declared input transfer.
4. Apply the 3D LUT.
5. Decode the LUT's declared output transfer and convert the LUT output gamut to Rec.709/sRGB primaries.
6. Encode sRGB for JPEG output.

The final JPEG is always sRGB/Rec.709, but the LUT output contract is not assumed to be Rec.709.
It is decoded and transformed from the LUT's declared output contract first.

Trusted catalog metadata that declares a non-display input and a complete output contract is treated as `combined-look-output`, even when the catalog intent string says `display-look`.
This preserves the stricter UI rule that manually selected `display-look` LUTs must be display-like, while allowing stable catalog technical/look LUTs with explicit output metadata to export through the scene-referred graph.

## Matrix Method

Gamut conversion matrices are derived from CIE 1931 `xy` primaries and white points:

1. Convert each primary and the white point from `xy` to `XYZ` with `Y = 1`.
2. Build an unscaled RGB-to-XYZ primary matrix.
3. Solve per-channel scale factors so RGB white maps to the declared white point.
4. Convert source RGB to XYZ and XYZ to destination RGB.
5. If source and destination white points differ, apply Bradford chromatic adaptation between the two white points before destination RGB conversion.

This is why linear ProPhoto RGB (D50) to camera gamuts (mostly D65) is covered by the same code path as camera/LUT output gamuts to Rec.709/sRGB.

Primary references:

- ICC ROMM RGB / ProPhoto RGB characterization data: <https://www.color.org/chardata/rgb/rommrgb.xalter>
- W3C sRGB profile interpretation, including BT.709 primaries, D65 white point, sRGB transfer, and D65-to-D50 Bradford adaptation guidance: <https://www.w3.org/Graphics/Color/srgb.pdf>
- ITU-R BT.2020: <https://www.itu.int/rec/R-REC-BT.2020/en>
- ITU-R BT.709: <https://www.itu.int/rec/R-REC-BT.709/en>

## Input Contract Coverage

These stable catalog input contracts are covered by public color math and runtime tests:

| Catalog input | Count | Runtime gamut | Runtime transfer | Reference |
| ------------------- | ----------------: | ------------- | -------------------- | ----------- | ----------------------------------------------------------------------- |
| `arri-wide-gamut-3  |       arri-logc3` | 2 | `arri-wide-gamut-3` | `logc3` | ARRI LogC3 specification |
| `dji-d-gamut        |        dji-d-log` | 1 | `dji-d-gamut` | `dji-d-log` | DJI D-Log/D-Gamut white paper |
| `fujifilm-f-gamut-c | fujifilm-f-log2c` | 12 | `f-gamut-c` | `f-log2c` | Fujifilm F-Log2 C data sheet |
| `leica-l-gamut      |      leica-l-log` | 2 | `rec2020` | `l-log` | Leica L-Log reference manual; modern Leica L-Log uses BT.2020 primaries |
| `rec2020            |        apple-log` | 1 | `rec2020` | `apple-log` | Apple Log ACES IDT / Apple Log public constants |
| `rec2020            |      nikon-n-log` | 5 | `rec2020` | `n-log` | Nikon N-Log LUT package metadata |
| `red-wide-gamut-rgb |      red-log3g10` | 16 | `red-wide-gamut-rgb` | `log3g10` | REDWideGamutRGB/Log3G10 white paper |
| `sony-s-gamut       |      sony-s-log2` | 4 | `s-gamut` | `s-log2` | Sony S-Log/S-Gamut documentation |
| `sony-s-gamut3-cine |      sony-s-log3` | 4 | `s-gamut3-cine` | `s-log3` | Sony S-Gamut3.
Cine/S-Log3 technical summary |
| `v-gamut            |            v-log` | 15 | `v-gamut` | `v-log` | Panasonic V-Log/V-Gamut reference manual |

Additional input contracts found in the catalog but not implemented as mathematical transforms:

| Catalog input | Count | Status |
| ------------- | -------------------: | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `display-p3   | om-system-om-log400` | 1 | Gamut is covered; OM-Log400 transfer is not implemented because no public formula was found.
|
| `rec2020      | om-system-om-log400` | 1 | Gamut is covered; OM-Log400 transfer is not implemented because no public formula was found.
|
| `rec709       |      insta360-i-log` | 2 | Rec.709 gamut is covered; Insta360 I-Log transfer is not implemented because public Insta360 docs describe LUT workflow but not the transfer function.
|
| `rec709       |      om-system-flat` | 1 | Rec.709 gamut is covered; OM System Flat transfer is not implemented because no public formula was found.
|
| `(missing)    |           (missing)` | 3 | Entry metadata has no input/output LUT contract.
|

The unresolved entries are intentionally fail-closed.
The runtime should not map these private curves to sRGB, gamma 2.4, or another curve by guesswork.

## Output Contract Coverage

These stable catalog output contracts are covered for export to final Rec.709/sRGB JPEG:

| Catalog output | Count | Runtime output handling |
| -------------- | ---------: | ----------------------- | ------------------------------------------ |
| `rec709        |    bt1886` | 21 | Rec.709 primaries plus `gamma24` transfer.
|
| `rec709        | gamma-2-4` | 2 | Rec.709 primaries plus `gamma24` transfer.
|
| `rec709        |      srgb` | 41 | Rec.709/sRGB primaries plus sRGB transfer.
|

Output contracts not implemented as mathematical transforms:

| Catalog output | Count | Status |
| -------------- | -------------: | ------ | ---------------------------------------------------------------------- |
| `rec709        | om-system-sdr` | 1 | Rec.709 gamut is covered; OM System SDR output transfer is not public.
|
| `rec709        | om-system-wdr` | 2 | Rec.709 gamut is covered; OM System WDR output transfer is not public.
|
| `(missing)     |     (missing)` | 3 | Entry metadata has no input/output LUT contract.
|

## Transfer And Gamut References

The runtime constants are aligned with the following public references:

- ARRI LogC3 / ARRI Wide Gamut 3: ARRI "ALEXA Log C Curve - Usage in VFX" defines the LogC3 formula and EI 800 parameters used by the runtime (`cut = 0.010591`, `a = 5.555556`, `b = 0.052272`, `c = 0.247190`, `d = 0.385537`, `e = 5.367655`, `f = 0.092809`): <https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf>
- ARRI LogC4 / ARRI Wide Gamut 4: ARRI LogC4 specification defines LogC4 and AWG4: <https://www.arri.com/resource/blob/278790/f3318e8c9c65617d8c5ca3f8b3e32051/2023-05-arri-logc4-specification-data.pdf>
- DJI D-Log / D-Gamut: DJI X9 white paper defines D-Log native EI formula and D-Gamut primaries (`R 0.71,0.31`, `G 0.21,0.88`, `B 0.09,-0.08`, D65): <https://dl.djicdn.com/downloads/DJI_Ronin_4D/X9_D_Log_D_Gamut_Whitepaper.pdf>
- Fujifilm F-Log2 C / F-Gamut C: Fujifilm F-Log2 C data sheet defines F-Log2C as the same curve as F-Log2 and lists F-Gamut C primaries: <https://dl.fujifilm-x.com/support/lut/F-Log2C_DataSheet_E_Ver.1.0.pdf>
- Leica L-Log: Leica L-Log reference manual v1.4 defines L-Log curve constants (`a = 8`, `b = 0.09`, `c = 0.27`, `d = 1.3`, `e = 0.0115`, `f = 0.6`) and states recent Leica L-Log cameras use ITU-R BT.2020 primaries: <https://leica-camera.com/sites/default/files/pm-101409-l-log_reference_manual_v1.4.pdf>
- Apple Log: Apple Log uses BT.2020 primaries; the ACES vendor IDT and Colour Science implementation publish the transfer constants (`R0 = -0.05641088`, `Rt = 0.01`, `c = 47.28711236`, `beta = 0.00964052`, `gamma = 0.08550479`, `delta = 0.69336945`): <https://raw.githubusercontent.com/ampas/aces-dev/528c78fe2c0f4e7eb322581e98aba05de79466cb/transforms/ctl/idt/vendorSupplied/apple/IDT.Apple.AppleLog_BT2020.ctl> and <https://github.com/colour-science/colour/blob/develop/colour/models/rgb/transfer_functions/apple_log_profile.py>
- REDWideGamutRGB / Log3G10: RED white paper lists RGB primaries, matrices, and Log3G10 constants (`a = 0.224282`, `b = 155.975327`, `c = 0.01`, `g = 15.1927`): <https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS%2C%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf>
- Sony S-Gamut3.
  Cine / S-Log3 and S-Gamut3 / S-Log3: Sony technical summary defines S-Log3 formula and related gamut workflow: <https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf>
- Sony S-Log overview: Sony support describes S-Log2/S-Log3 intent and workflow: <https://www.sony.com/electronics/support/articles/00145908>
- Panasonic V-Log / V-Gamut: Panasonic reference manual defines V-Log formula and V-Gamut primaries (`R 0.730,0.280`, `G 0.165,0.840`, `B 0.100,-0.030`, D65): <https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf>
- sRGB transfer and Rec.709 primaries: W3C sRGB profile interpretation: <https://www.w3.org/Graphics/Color/srgb.pdf>
- BT.1886 display EOTF: ITU-R BT.1886: <https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf>
- OM System I-Log/Flat-related catalog entries: public OM System pages confirm OM-Log400 as a shooting mode but do not provide an OETF formula suitable for implementation: <https://explore.omsystem.com/c/en/om-3>
- Insta360 I-Log: public Insta360 docs describe I-Log capture and official LUT workflow, but do not provide an OETF formula: <https://onlinemanual.insta360.com/acepro2/en-us/operation-tutorials/shoot-preview/shooting-features/i-log>

## Test Coverage

Coverage is locked by these package tests:

- `registry.test.ts`: verifies stable catalog aliases with public math resolve to runtime gamut/transfer IDs, and verifies private OM System/Insta360 curves stay unresolved.
- `lut-contract.test.ts`: verifies trusted catalog metadata with non-display input and complete output normalizes to a combined output LUT contract.
- `log-encoding.test.ts`: verifies Apple Log, DJI D-Log, Leica L-Log, and existing transfer reference points.
- `matrix.test.ts`: verifies linear ProPhoto RGB to every covered stable catalog input gamut and covered LUT output gamut to Rec.709/sRGB produces finite matrices.
