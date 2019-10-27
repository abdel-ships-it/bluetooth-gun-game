import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { BluetoothLE, ScanStatus, DeviceInfo } from '@ionic-native/bluetooth-le/ngx';
import { first, takeUntil, filter, tap, map } from 'rxjs/operators';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { BluetoothGunService } from '../bluetooth-gun.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements AfterViewInit, OnDestroy {

  private stop$ = new Subject();

 constructor(
   private bluetoothLe: BluetoothLE,
   private alertCtrl: AlertController,
   private router: Router,
   private bluetoothGunService: BluetoothGunService
  ) { }

  ngAfterViewInit() { }

  async connectToGun() {
    console.log('Connect to gun pressed');

    const isInitializedResult = await this.bluetoothLe.isInitialized();

    // If bluetooth plugin is not initalized, we will initalize it
    //
    if ( !isInitializedResult.isInitialized ) {
      console.log('isInitialized is false, calling initialize');

      await this.bluetoothLe.initialize().pipe(
        first(value => value.status === 'enabled')
      ).toPromise();
    } else {
      console.log('isInitialized is already true, continuing');
    }


    try {
      const retrieveConnected = await this.bluetoothLe.retrieveConnected({
        services: [this.bluetoothGunService.matchingService]
      });

      const devices = retrieveConnected as unknown as DeviceInfo[];

      console.log('retrieveConnected', retrieveConnected);

      const hasDevices = devices != null && devices.length > 0 ;

      if (hasDevices) {
        this.router.navigate([`../game/${devices[0].address}`]);
      }
    } catch ( error ) {
      console.error('Error retrieving connected', error);
    }

    const isScanningResult = await this.bluetoothLe.isScanning();

    if (isScanningResult.isScanning) {
      await this.bluetoothLe.stopScan().catch(error => {
        console.error('not scanning..', error);
      });
    }

    this.bluetoothLe.startScan({
      services: [this.bluetoothGunService.matchingService],
    })
    .pipe(
      takeUntil(this.stop$)
    )
    .subscribe(async scanStatus => {
      console.log('scan status..', scanStatus);

      if (scanStatus.address) {
        // As soon as we find a match we will stop scanning as scanning is expensive.
        //
        this.bluetoothLe.stopScan();

        console.log('found device with address ' , scanStatus.address);

        try {
          const isConnectedResult = await this.bluetoothLe.isConnected({
            address: scanStatus.address
          });

          console.log('isConnectedResult', isConnectedResult);

          if ( !isConnectedResult.isConnected ) {
            console.log('isConnected didnt throw meaning this was a device connected to before, reconnecting');
            this.reconnect(isConnectedResult.address);
          } else {
            console.log('Device already connected setup listeners');

            this.listenToNotifications(isConnectedResult.address);
          }
        } catch ( error ) {
          console.log('isConnected threw meaning this was a device never connected to before, connecting', error);

          // This means we were never connected to this device, so we can connect to it
          //

          this.connect(scanStatus.address);
        }


      }
    }, err => console.error('error starting scan', err));

  }

  reconnect(address: string) {
    this.bluetoothLe.reconnect({ address }).pipe(
      takeUntil(this.stop$)
    )
    .subscribe( async deviceInfoEmission => {
      const deviceInfo = deviceInfoEmission as unknown as DeviceInfo;

      console.log('reconnect emission..', deviceInfo);

      if ( deviceInfo.status === 'disconnected' ) {
        console.log('reconnect disconnected');

        return;
      }

      if ( deviceInfo.status === 'connected' ) {
        console.log('Reconnection was succesful, setting up listeners');

        // We need to discover all the services and characteristics after reconnecting
        //
        await this.bluetoothLe.discover({ address });

        this.listenToNotifications(address);
      }
    });
  }

  connect(address: string) {
    this.bluetoothLe.connect({ address })
    .pipe(
      takeUntil(this.stop$)
    )
    .subscribe(async deviceInfo => {

      console.log('connect...', deviceInfo);

      if (deviceInfo.status === 'disconnected') {
        console.log('disconnected..');

        return;
      }

      console.log('connected', deviceInfo);

      const deviceDiscovery = await this.bluetoothLe.discover({
        address
      });

      console.log(deviceDiscovery);

      this.listenToNotifications(address);
    }, err => console.error('error connecting...', err));
  }

  // Consider moving this to game page
  //
  async listenToNotifications(address: string) {
    console.log('Listen to notifications called');

    const ionAlert = await this.alertCtrl.create({
      header: 'Connected to gun',
      message: 'Shoot three times to start',
      buttons: [{
        text: 'Try again'
      }],
      backdropDismiss: false
    });

    ionAlert.present();

    let reloadedCount = 0;

    this.bluetoothLe.subscribe({
      address,
      characteristic: this.bluetoothGunService.matchingCharacteristics,
      service: this.bluetoothGunService.matchingService
    })
    .pipe(
      takeUntil(this.stop$),
      tap( operation => console.log('operation emission', operation)),
      filter( operation =>  operation.value != null ),
      map(operation => this.bluetoothGunService.decodeOperation(operation))
    ).subscribe(async decodedValue => {

      if ( this.bluetoothGunService.buttons.trigger.includes(decodedValue) ) {
        reloadedCount += 0.5;

        const numbersMap = {
          1: 'one',
          2: 'two',
          3: 'three'
        };

        if (reloadedCount % 1 === 0 ) {
          const timesToGo = 3 - reloadedCount;
          ionAlert.message = `Shoot ${numbersMap[timesToGo]} time${timesToGo === 1 ? '' : 's'} to start`;
        }
      }

      if ( reloadedCount === 3 ) {
        await ionAlert.dismiss();

        this.router.navigate([`../game/${address}`]);
      }

      console.log('notify....', decodedValue);
    }, err => console.error('error subscribing..', err));
  }

  ngOnDestroy() {
    this.stop$.next();
  }

}
