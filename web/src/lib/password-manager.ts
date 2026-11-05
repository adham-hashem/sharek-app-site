import { Capacitor, registerPlugin } from '@capacitor/core';
interface PasswordManagerPlugin {
 choose():Promise<{username:string;password:string}>;
 save(credential:{username:string;password:string}):Promise<void>;
}
export const PasswordManager=registerPlugin<PasswordManagerPlugin>('PasswordManager');
export const hasDevicePasswordManager=()=>Capacitor.getPlatform()==='android';
