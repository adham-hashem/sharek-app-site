import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase} from './supabase';
const native=registerPlugin<{preferences(options:{enabled:boolean}):Promise<void>;client():Promise<{installationId:string;installedVersion:number;playManaged:boolean}>}>('AppUpdates');
export async function syncAppUpdatePreferences(){if(Capacitor.getPlatform()!=='android')return;const enabled=localStorage.getItem('sharek-update-checks')!=='off';await native.preferences({enabled});const client=await native.client();const {error}=await supabase.rpc('record_app_update_client',{p_installation_id:client.installationId,p_version:client.installedVersion,p_enabled:enabled,p_play:client.playManaged});if(error)throw error;}
