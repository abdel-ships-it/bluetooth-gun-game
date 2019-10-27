import { Injectable } from '@angular/core';
import { OperationResult, BluetoothLE } from '@ionic-native/bluetooth-le/ngx';

@Injectable({
  providedIn: 'root'
})
export class BluetoothGunService {

  matchingService = '0000fff0-0000-1000-8000-00805f9b34fb';

  matchingCharacteristics = '0000fff4-0000-1000-8000-00805f9b34fb';

  buttons = {
    trigger: ['B2DOWN', 'B2UP'],
    forestock: ['B3DOWN', 'B3UP'],
    redButton: ['B4DOWN', 'B4UP']
  };

  constructor(private bluetoothLe: BluetoothLE) { }

  decodeOperation(operation: OperationResult) {
    const value = this.bluetoothLe.encodedStringToBytes(operation.value);

    const decoder = new TextDecoder();

    const decodedValue = decoder.decode(value);

    return decodedValue;
  }
}
