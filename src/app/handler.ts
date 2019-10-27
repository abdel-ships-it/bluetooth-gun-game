// enum ButtonState {
//     UP = 'UP',
//     DOWN = 'DOWN'
// }

// document.querySelector('button').addEventListener('click', async () => {
//     const bluetooth = ((navigator as any).bluetooth as webbluetooth.Bluetooth);

//     const connectionState = document.querySelector<HTMLElement>('.connection-state');

//     try {

//         const device = await bluetooth.requestDevice({
//             filters: [{
//                 services: [
//                     '0000fff0-0000-1000-8000-00805f9b34fb'
//                 ]
//             }, {
//                 name: 'SHOWBABY_00:07:C0'
//             }]
//         });

//         console.log(device);

//         device.ongattserverdisconnected = (e) => {
//             console.log('on disconnect', e);
//             connectionState.innerHTML = 'disconnected';
//             (connectionState as HTMLElement).style.color = 'red';

//             const interval = setInterval(async () => {
//                 console.log('retrying..');

//                 try {
//                     await device.gatt.connect();

//                     console.log('reconnect success');

//                     connectionState.innerHTML = 'connected';
//                     connectionState.style.color = 'green';

//                     clearInterval(interval);
//                 } catch (error) {
//                     console.error('Failed to reconnect...');
//                 }
//             }, 1000);

//             setTimeout(() => {
//                 clearInterval(interval);
//             }, 10000);
//         };

//         const server = await device.gatt.connect();

//         connectionState.innerHTML = 'connected';
//         connectionState.style.color = 'green';

//         const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb')

//         const char = await service.getCharacteristic('0000fff4-0000-1000-8000-00805f9b34fb')

//         char.startNotifications();

//         char.addEventListener('characteristicvaluechanged', e => {
//             const buffer = (e.target as any).value.buffer;

//             const val = new Uint16Array(buffer);

//             const decoder = new TextDecoder();

//             const decodedValue = decoder.decode(val);

//             console.log(buffer, " ", decodedValue);

//             const buttons = {
//                 trigger: ['B2DOWN', 'B2UP'],
//                 forestock: ['B3DOWN', 'B3UP'],
//                 redButton: ['B4DOWN', 'B4UP']
//             };

//             const domSelectorButtonNameMap = {
//                 trigger: '.two',
//                 forestock: '.three',
//                 redButton: '.four'
//             }

//             const matchingEntry = Object.entries(buttons).find(([buttonName, event]) => {
//                 return event.includes(decodedValue);
//             });

//             const [matchingEntryName] = matchingEntry;

//             const buttonState = decodedValue.endsWith('UP') ? ButtonState.UP : ButtonState.DOWN

//             const matchingNode = document.querySelector<HTMLElement>(domSelectorButtonNameMap[matchingEntryName])

//             matchingNode.style.display = 'flex';
//             matchingNode.innerText = buttonState;

//             setTimeout(() => {
//                 matchingNode.style.display = 'none';
//                 matchingNode.innerText = '';
//             }, 3000);
//         });
//     } catch (error) {
//         console.error(error.message)
//     }
// });
