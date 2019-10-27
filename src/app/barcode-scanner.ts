import { ElementRef, Injectable, NgZone } from '@angular/core';
import { Platform } from '@ionic/angular';
import { get, isNil } from 'lodash';
import { Observable, Subject } from 'rxjs';

declare var Scandit: any;

/**
 * Interface describing the result of the barcode scan, might contain errors or actual data
 * included in the structure
 */
export interface IBarcodeScannerResult {
  status: 'OK' | 'ERROR';
  /**
   * Whenever a component is listening to scan events, they register their name via CameraPlaceHolder.register
   * This property will contain the name of the component the scan event was for, to ensure only one page handles the scan event
   * This is because having multiple pages listening to this provider for scan events is possible
   */
  rawData?: string;
  error?: any;
}


@Injectable()
export class BarcodeScannerProvider {

  public isCollapsed: boolean;
  public isForcePaused: boolean;
  public isPaused: boolean;
  public isIdle: boolean;

  // Public data stream contain of the scann results
  //
  public data$: Observable<IBarcodeScannerResult>;

  /** Whether to scanner is active or not */
  public isActive: boolean;

  /** Represents the height of the camera in viewport height units */
  public CAMERA_VIEWPORT_HEIGHT = 23;

  private dataSubject = new Subject<IBarcodeScannerResult>();

  /**
   * Property holding a reference to the Scandit picker
   *
   */
  private scanditPicker: any;

  /**
   * Should the scanning be paused between each scan?
   */
  private pauseBetweenScans: boolean;


  /**
   * Reference to the HTML Body element, used for toggling a class indicating the
   * camera is active
   */
  private body: HTMLElement;

  /**
   * Creates an instance of BarcodeScannerProvider.
   */
  constructor(
    public platform: Platform,
    private ngZone: NgZone,
  ) {
    this.data$ = this.dataSubject;
    this.pauseBetweenScans = false;

    this.body =  document.body as HTMLElement;
  }


  /**
   * Configure the scanner to pause between scans, the consumer / caller is
   * responsible to resume again
   *
   */
  public setPauseBetweenScans(doPause: boolean) {
    this.pauseBetweenScans = doPause;
  }

  /**
   * Initiate scanning
   */
  public startScan(pauseBetweenScans?: boolean) {

    if (this.isCollapsed) {
      console.log('Not starting because collapsed');
      return;
    }

    this.setActive(true);

    if (!this.platform.is('cordova')) {
      console.warn('Only implemented for cordova deployments');
      return;
    }

    if (!isNil(pauseBetweenScans)) {
      this.setPauseBetweenScans(pauseBetweenScans);
    }

    // Make sure the cordova platform is actually ready
    //
    return this.platform.ready()
      .then(() => this.setupScandit())
      .then(() => {
        const scanditMargins = new Scandit.Margins(0, 0, 0, 0);

        this.scanditPicker.setMargins(
          scanditMargins,
          scanditMargins,
          0.4 // animation duration
        );


        const overlay = this.scanditPicker.getOverlayView();

        overlay.setGuiStyle(Scandit.ScanOverlay.GuiStyle.NONE);

        overlay.setBeepEnabled(false);

        overlay.setVibrateEnabled(false);

        this.scanditPicker.show({
          didScan: (session: any) => {
            console.log('Scandit result', session);

            const code = get(session, 'newlyRecognizedCodes[0]');

            if (this.pauseBetweenScans) {
              this.scanditPicker.pauseScanning();
              this.isPaused = true;
            }

            this.publish({
              status: 'OK',
              rawData: code.data
            });
          },
          didCancel: (error: string) => {
            if (error === 'Canceled') {
              // console.log( 'Canceled' );
            } else {

              console.log('Scandit error', error);

              this.publish({
                status: 'ERROR',
                error
              });
            }
          },
          didChangeState: state => {
            console.log(state);
          },
          didChangeProperty: propChange => {
            this.scanditPicker.setOrientations([
              Scandit.BarcodePicker.Orientation.LANDSCAPE_RIGHT,
              Scandit.BarcodePicker.Orientation.LANDSCAPE_LEFT]
            );
          }
        });

        console.log('Start scanning');
        this.scanditPicker.startScanning();

        if (this.isForcePaused) {
          console.log('Directly pausing after start scan because we are forced pauzed');
          this.scanditPicker.pauseScanning();
          this.isPaused = true;
        } else {
          this.isPaused = false;
        }
      })
      .catch((error) => {
        console.error('Problem setting up / starting Scandit scanner', error);
      });
  }

  /**
   * Temporary pause the scanning but keep the camera preview open
   */
  public pauseScan(force?: boolean) {
    if (this.scanditPicker) {
      this.scanditPicker.pauseScanning();
      console.info('Pausing scan');
    } else {
      console.warn('Scandit picker is not setup yet. Unable to pause something that hasnot been setup or started.');
    }

    this.isPaused = true;

    if (force) {
      this.isForcePaused = true;
    }
  }

  /**
   * Resume a paused scan
   *
   */
  public resumeScan(force?: boolean) {
    if (this.isActive) {

      if (this.isForcePaused && !force) {
        console.info('Scanner is force paused, not resuming because resumeScan is called without force: true');
      } else {
        console.info('Resuming after pause');

        if (this.isForcePaused) {
          this.isForcePaused = false;
        }

        this.isPaused = false;

        if (this.scanditPicker) {
          this.scanditPicker.resumeScanning();
        } else {
          console.warn('Scandit picker is not setup yet. Unable to resume something that hasnot been setup or started.');
        }
      }
    } else {
      console.warn('You attempted to resume the scanner while it was inactive, please activate the scanner first');
    }
  }

  /**
   * Collapse the barcode scanner
   */
  public collapse(duration?: number) {
    this.pauseScan();

    this.isCollapsed = true;

    setTimeout(() => {
      this.stopScan();
    }, duration * 1000);
  }

  /**
   * Expand the barcode scanner back to it's original dimensions
   */
  public expand() {
    // console.log( 'expand' );
    this.isCollapsed = false;

    this.startScan();
  }


  /**
   * Stop the idle timer
   *
   */
  public stopIdleTimer() {
    this.isIdle = false;
  }


  /**
   * Stop and close the scanner
   */
  private stopScan() {
    console.log('Stop scanning');
    this.setActive(false);

    if (!this.scanditPicker) {
      console.info('Scandit picker is not setup yet. Unable to stop something that hasnot been setup or started.');
      return;
    }

    this.scanditPicker.cancel();
  }

  /**
   * Convenience method for publishing data to the datasubject
   *
   */
  private publish(data: IBarcodeScannerResult) {
    this.ngZone.run(() => {
      this.dataSubject.next(data);
    });
  }

  /**
   * Initialize and configure the Scandit scanner. This can be called multiple time, but effectively only does something the
   * first time it is run. Main reason for this is that the Scandit plugin doesn't allow re-set'ting the AppKey.
   */
  private async setupScandit(): Promise<any> {

    if (!( window as any).Scandit) {
      throw new Error('No scandit plugin found! Unable to setup');
    }

    // Only once, early exit when already instantiated
    //
    if (this.scanditPicker) {
      return this.scanditPicker;
    }

    // tslint:disable-next-line: max-line-length
    const scanditAppKey = 'AcwttyUxOzyfAw/oXRAg/7w/zNFaMBqI8X7ZtgIKX8KFDlQfm3Z1hnYtuCmoZtPID2z7KGgDFhuhZ24tjmlUbGFv1f/scmh3SzIBkPloschAM1liQ1j813M4JlBBMyGjAxZTFs8sMW+2ii7PtUTvbeIi09HZYPpk3KumhqbCDKx6iMfxek82Yso5GC9GwR00pYzUoe3/P4rFc3LBaRiQ9Y8n7GlXKCUd8b/3Z5tLq1sUP+LDlaRW1n837p6VrmntC640kEHd2N9CuqCU7ZY1wL96i48NHNGyRl3u7ZjqJDskPYLi0dwVGjL49BMYhQwL1/5IOWZ8LF1A3koyXfk+iOSI6ar9jfYNGyUImNvO6j/MeCSbOoHaBRX/Bg3R+Q2GG7NtCAB+mwtoRY+L5W7Z/iPtncvEl4osb87yiLybTAbM0VHpR1iOPbGHsxv7TCzyC+iCVhOAYvDSzSmIycIO8DR1SM3Bt0+an+heiDY2n/1yEPdu7opkbvybXr7taQwZAuJBYOnAaiH9Z0lWCahXZbZanDWqfwEo6VEar3GlBn2vLwJcCIPXBoeIZpeRQ/s6hjmRkk6DxuVQXAheskMEDJnYd6NKcGWHTb4aRgFImx+3iBkCfwyIXjiZYLa1hlc26Ug8GY/6QUhJVnLC5US7NuXfTD5t3BdgsX4X7GRWvuddgk9Iw86x8c8a7nqspaiSEPV+ldcwH04KCOXrtqWjx0hM4QxFdxYi0T2RDQJWvAKG9+HnoQoIgCzzXVO7Rp0yL75kBIFT13mLJ1R8aAIN2XiuLLhyMnL7rRhxxAFD7qpJot1know=';

    Scandit.License.setAppKey(scanditAppKey);

    // Setup scanner settings
    //
    const settings = new Scandit.ScanSettings();
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.EAN13, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.EAN8, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.UPCA, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.UPCE, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.CODE39, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.ITF, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.QR, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.DATA_MATRIX, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.CODE128, true);
    settings.setSymbologyEnabled(Scandit.Barcode.Symbology.CODE39, true);

    settings.symbologies[Scandit.Barcode.Symbology.CODE128].activeSymbolCounts = [
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28
    ];

    // We need to support inverted QR codes
    //
    const qrSettings = settings.getSymbologySettings(Scandit.Barcode.Symbology.QR);
    qrSettings.colorInvertedEnabled = true;

    // Some 1d barcode symbologies allow you to encode variable-length data. By default, the
    // Scandit BarcodeScanner SDK only scans barcodes in a certain length range. If your
    // application requires scanning of one of these symbologies, and the length is falling
    // outside the default range, you may need to adjust the "active symbol counts" for this
    // symbology. This is shown in the following few lines of code.
    //
    const symSettings = settings.getSymbologySettings(Scandit.Barcode.Symbology.CODE39);

    symSettings.activeSymbolCounts = [
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
    ];


    // Zoom maximally out
    //
    settings.relativeZoom = 0;
    settings.workingRange = 'long';


    this.scanditPicker = new Scandit.BarcodePicker(settings);

    this.scanditPicker.continuousMode = true;

    return this.scanditPicker;
  }

  /**
   * Set the camera state to be active or not
   */
  private setActive(state: boolean = true) {
    this.isActive = state;

    if (state) {
      this.body.classList.add('barcodescanner-active');
    } else {
      this.body.classList.remove('barcodescanner-active');
    }
  }

}
