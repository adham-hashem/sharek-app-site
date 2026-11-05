import {Capacitor,registerPlugin} from '@capacitor/core';
const native=registerPlugin<{open(options:{originLat:number;originLng:number;destinationLat:number;destinationLng:number;chooserTitle:string}):Promise<void>}>('ExternalNavigation');
export async function openExternalNavigation(originLat:number,originLng:number,destinationLat:number,destinationLng:number,language:'ar'|'en'){
 if(Capacitor.isNativePlatform()){
  await native.open({originLat,originLng,destinationLat,destinationLng,chooserTitle:language==='ar'?'ابدأ الملاحة':'Start navigation'});
  return;
 }
 window.open(`https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationLat},${destinationLng}&travelmode=walking&dir_action=navigate`,'_blank','noopener,noreferrer');
}
