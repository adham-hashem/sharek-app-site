import { Capacitor, registerPlugin } from '@capacitor/core';
import {App} from '@capacitor/app';
type LocationState={servicesEnabled:boolean;granted:boolean;precise:boolean;permission:string};
const bridge=registerPlugin<{
 status():Promise<LocationState>;
 requestLocationPermission():Promise<LocationState>;
 openSettings(options:{kind:'location'|'permission'}):Promise<void>;
 addListener(event:'locationServicesChanged',callback:(state:LocationState)=>void):Promise<{remove():Promise<void>}>;
}>('LocationArea');
// A plain bridge adapter keeps lifecycle tests independent of device APIs.
export const LocationSettings={status:()=>bridge.status(),requestLocationPermission:()=>bridge.requestLocationPermission(),openSettings:(options:{kind:'location'|'permission'})=>bridge.openSettings(options),addListener:(event:'locationServicesChanged',callback:(state:LocationState)=>void)=>bridge.addListener(event,callback)};
export const LocationLifecycle={onResume:(callback:(state:{isActive:boolean})=>void)=>App.addListener('appStateChange',callback)};
export const hasLocationSettings=()=>Capacitor.getPlatform()==='android';
