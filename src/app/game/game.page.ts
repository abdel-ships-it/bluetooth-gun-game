import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { BarcodeScannerProvider } from '../barcode-scanner';
import { BluetoothLE, DescriptorParams } from '@ionic-native/bluetooth-le/ngx';
import { BluetoothGunService } from '../bluetooth-gun.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, tap, filter, map, first } from 'rxjs/operators';
import { AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/firestore';
import { Highscore } from '../highscores/highscores.page';

@Component({
  selector: 'app-game',
  templateUrl: './game.page.html',
  styleUrls: ['./game.page.scss'],
})
export class GamePage implements OnInit, OnDestroy {

  GAME_TIME = 60;

  timeLeft: {
    secondsLeft: number;
    label: string
  } = {
    label: '',
    secondsLeft: this.GAME_TIME
  };

  killSet = new Set();

  public get killsCount(): number {
    return this.killSet.size;
  }

  public get shotsCount(): number {
    return Math.floor(this.internalShots);
  }

  internalShots = 0;

  private _feedback: string;

  public get feedback(): string {
    return this._feedback;
  }

  public set feedback(value: string) {
    this._feedback = value;

    setTimeout(() => {
      this._feedback = null;
    }, 3000);
  }

  private stop$ = new Subject();

  constructor(
    private barcodeScanner: BarcodeScannerProvider,
    private bluetoothLe: BluetoothLE,
    private bluetoothGunService: BluetoothGunService,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private router: Router,
    private angularFirestore: AngularFirestore
  ) { }

  async ngOnInit() {
    try {
      await this.barcodeScanner.startScan();

      console.log('start scan called...');
    } catch ( error ) {
      console.error('Error starting scan', error);
    }

    this.barcodeScanner.pauseScan();

    const soundEffect = new Audio('../../assets/blaster-ricochet.wav');

    const barcodeScannerSubscription = this.barcodeScanner.data$
    .pipe(
      map(barcodeData => barcodeData.rawData)
    )
    .subscribe(async barcode => {
      if (!(/monster-([1-9]{1,2})/.test(barcode)) ) {
        console.log('Barcode doesnt match the monster format');

        return;
      }

      if ( this.killSet.has(barcode) ) {
        console.log('You already killed this monster');

        this.feedback = 'You already killed this monster';
      } else {
        this.feedback = 'Kill!';

        console.log('kill!');

        try {
          await soundEffect.play();
        } catch ( error ) {
          console.error('Error playing sound effect');
        }

        this.killSet.add(barcode);
      }

    });

    const address = this.route.snapshot.params.address;

    const descriptorParams: DescriptorParams = {
      address,
      characteristic: this.bluetoothGunService.matchingCharacteristics,
      service: this.bluetoothGunService.matchingService
    };

    // Ideally we subscribed in a central place and just listened to events, but for now this will be good enough
    //
    try {
      await this.bluetoothLe.unsubscribe(descriptorParams);
      console.log('unsubscribed');
    } catch ( error ) {
      console.error('unsubscribe failed', error);
    }

    this.bluetoothLe.subscribe(descriptorParams)
    .pipe(
      takeUntil(this.stop$),
      tap(operation => console.log('operation emission', operation)),
      filter(operation => operation.value != null),
      map( operation => this.bluetoothGunService.decodeOperation(operation))
    ).subscribe( decodedValue => {
      console.log('decodeValue', decodedValue);

      const [down, up] = this.bluetoothGunService.buttons.trigger;

      if ( decodedValue === down ) {
        console.log('Resuming scan');
        this.barcodeScanner.resumeScan();
      } else if ( decodedValue === up ) {
        console.log('Pausing scan');
        this.barcodeScanner.pauseScan();
      }

      if ( decodedValue === up || decodedValue === down ) {
        this.internalShots += 0.5;
      }
    }, error => console.error('error subscribing to gun events..', error));

    const interval = setInterval(async () => {
      this.timeLeft.secondsLeft--;
      const unroundedMinutes = this.timeLeft.secondsLeft / 60;
      const minutes = Math.floor(unroundedMinutes);
      const seconds = Math.ceil((unroundedMinutes - Math.floor(unroundedMinutes)) * 60);
      this.timeLeft.label = `${minutes}:${seconds}`;

      if (this.timeLeft.secondsLeft === 0) {
        barcodeScannerSubscription.unsubscribe();

        this.barcodeScanner.pauseScan();

        clearInterval(interval);

        const documentsNumber = await this.angularFirestore.collection('highscore')
          .get()
          .pipe(
            first(),
            map(data => data.size)
          ).toPromise();


        const ionAlert = await this.alertCtrl.create({
          header: 'Time is up',
          message: 'Please fill in your name for highscores',
          inputs: [{
            label: 'Name',
            value: `Player ${documentsNumber + 1}`,
            name: 'name',
            handler: (input) => {
              console.log(input.value);
            }
          }],
          buttons: ['save'],
          backdropDismiss: false
        });

        await ionAlert.present();

        const overlayEventDetail = await ionAlert.onDidDismiss();

        const playerName = overlayEventDetail.data.values.name;

        await this.saveInDatabase(playerName);
      }
    }, 1000);
  }

  private async saveInDatabase(playerName: string) {

    try {
      await this.angularFirestore.collection('highscore').add({
        playerName,
        kills: this.killsCount,
        shots: this.shotsCount
      } as Highscore);
    } catch (error) {
      console.error('Error adding highscore', error);
    } finally {
      this.router.navigate(['../highscores']);
    }
  }

  @HostListener('click') start() {
    this.barcodeScanner.startScan();
  }

  ngOnDestroy() {
    this.barcodeScanner.collapse(0);

    this.stop$.next();
  }

}
