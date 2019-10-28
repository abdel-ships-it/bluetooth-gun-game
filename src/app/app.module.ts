import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { BluetoothLE } from '@ionic-native/bluetooth-le/ngx';
import { ScreenOrientation } from '@ionic-native/screen-orientation/ngx';
import { BarcodeScannerProvider } from './barcode-scanner';
import { BluetoothGunService } from './bluetooth-gun.service';
import { AngularFireModule } from '@angular/fire';
import { AngularFirestoreModule } from '@angular/fire/firestore';
import { environment } from 'src/environments/environment';
import { Insomnia } from '@ionic-native/insomnia/ngx';
import { Flashlight } from '@ionic-native/flashlight/ngx';


@NgModule({
  declarations: [AppComponent],
  entryComponents: [],
  imports: [
    BrowserModule,
    IonicModule.forRoot({
      animated: false,
      swipeBackEnabled: false
    }),
    AppRoutingModule,
    AngularFireModule.initializeApp(environment.firebaseConfig, 'bluetooth-gun-game'),
    AngularFirestoreModule,
    HttpClientModule
  ],
  providers: [
    StatusBar,
    SplashScreen,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    BluetoothLE,
    BarcodeScannerProvider,
    ScreenOrientation,
    BluetoothGunService,
    Insomnia,
    Flashlight
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
