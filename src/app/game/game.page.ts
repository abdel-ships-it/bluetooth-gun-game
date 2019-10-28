import { Component, OnInit, HostListener, OnDestroy } from '@angular/core';
import { BarcodeScannerProvider } from '../barcode-scanner';
import { BluetoothLE, DescriptorParams } from '@ionic-native/bluetooth-le/ngx';
import { BluetoothGunService } from '../bluetooth-gun.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, tap, filter, map, first, take } from 'rxjs/operators';
import { AlertController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/firestore';
import { Highscore } from '../highscores/highscores.page';
import { Insomnia } from '@ionic-native/insomnia/ngx';
import { HttpClient } from '@angular/common/http';
import { Flashlight } from '@ionic-native/flashlight/ngx';

interface PrinterHighscore extends Highscore {
  currentPlayer: boolean;
}

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
    private angularFirestore: AngularFirestore,
    private insomnia: Insomnia,
    private httpClient: HttpClient,
    private flashlight: Flashlight
  ) { }

  async ngOnInit() {
    try {
      await this.insomnia.keepAwake();
    } catch ( error ) {
      console.error('[insomnia] Keep awake failed', error);
    }

    try {
      // This will be true the second time the barcode is used
      //
      if ( this.barcodeScanner.isCollapsed ) {
        this.barcodeScanner.expand();
      }

      await this.barcodeScanner.startScan();

      console.log('start scan called...');
    } catch ( error ) {
      console.error('Error starting scan', error);
    }

    this.barcodeScanner.pauseScan();

    const laserEffect = new Audio('../../assets/laser.wav');
    const hitEffect = new Audio('../../assets/hit.wav');

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

        this.killSet.add(barcode);

        hitEffect.play().catch( error => {
          console.error('Error playing hit effect', error);
        });
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

    const bluetoothSubscription = this.bluetoothLe.subscribe(descriptorParams).pipe(
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

        laserEffect.play().catch(error => {
          console.error('Error playing sound effect hit', error);
        });

        this.flashlight.switchOn().catch( error => {
          console.error('[flashlight] error turning on flashlight', error);
        });

        setTimeout(() => {
          this.flashlight.switchOff().catch( error => {
            console.error('[flashlight] error turning off flashlight', error);
          });
        }, 1000);
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

      const minutesLabel = minutes.toString().length === 1 ? `0${minutes}` : minutes;

      const secondsLabel = seconds.toString().length === 1 ? `0${seconds}` : seconds;

      this.timeLeft.label = `${minutesLabel}:${secondsLabel}`;

      if (this.timeLeft.secondsLeft === 0) {
        // Clean interval
        //
        clearInterval(interval);

        barcodeScannerSubscription.unsubscribe();

        bluetoothSubscription.unsubscribe();

        this.barcodeScanner.pauseScan();

        const documentsNumber = await this.angularFirestore.collection('highscore')
          .get()
          .pipe(
            first(),
            map(data => data.size)
          ).toPromise();

        const newHighScore = await this.isNewHighscore(this.killsCount);

        const ionAlert = await this.alertCtrl.create({
          header: `Time is up ${newHighScore ? ',New highscore!' : ''}`,
          message: 'Please fill in your name for the highscores',
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

        await this.saveHighscore(playerName);
      }
    }, 1000);
  }

  private async saveHighscore(playerName: string) {

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

    const highscores = await this.angularFirestore.collection('highscore').valueChanges().pipe(
      map(highscoresData => highscoresData as Highscore[]),
      map(highscoresData => highscoresData.sort((a, b) => b.kills - a.kills)),
      first()
    ).toPromise();

    const newestHighscore = highscores.find( highscore => highscore.playerName === playerName );

    if ( newestHighscore ) {
      (newestHighscore as PrinterHighscore).currentPlayer = true;
      newestHighscore.playerName += ' (NEW)';
    }

    try {
      console.log('Printing highscore...', highscores);
      await this.httpClient.post(
        'https://europe-west1-next-agency-691ee.cloudfunctions.net/new-black-scan-and-destroy-print',
        highscores
      ).pipe(take(1)).toPromise();
      console.log('Printing highscore done...');
    } catch ( error ) {
      console.error('Printing highscore failed', error);
    }
  }

  private async isNewHighscore(kills: number): Promise<boolean> {
    const highscores = await this.angularFirestore.collection('highscore').get().pipe(
      first(),
      map(data => (data.docs || []).map( doc => doc.data() as Highscore ))
    ).toPromise();

    const isNewHighscore = highscores.every( highscore => highscore.kills < kills );

    return isNewHighscore;
  }

  @HostListener('click') start() {
    this.barcodeScanner.startScan();
  }

  async ngOnDestroy() {
    this.barcodeScanner.collapse(0);

    this.stop$.next();

    try {
      await this.insomnia.allowSleepAgain();
    } catch (error) {
      console.error('[insomnia] allow sleep agai failed', error);
    }
  }

}
