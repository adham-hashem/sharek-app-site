import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase} from './supabase';
const ChatMedia=registerPlugin<{saveImage(options:{url:string;name:string}):Promise<{saved?:boolean;cancelled?:boolean}>;chooseImage():Promise<{uri?:string;name?:string;mime?:string;cancelled?:boolean}>}>('ChatMedia');
export const nativeGalleryAvailable=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('ChatMedia');
export async function chooseNativeChatImage():Promise<File|null>{const result=await ChatMedia.chooseImage();if(result.cancelled||!result.uri)return null;const response=await fetch(Capacitor.convertFileSrc(result.uri));if(!response.ok)throw Error('CHAT_IMAGE_UNAVAILABLE');const blob=await response.blob(),file=new File([blob],result.name??'SHARek-image.jpg',{type:result.mime??blob.type});validateChatImage(file);return file;}
export const imageTypes:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
export function validateChatImage(file:File){if(!imageTypes[file.type])throw new Error('IMAGE_TYPE');if(file.size>10485760||file.size===0)throw new Error('IMAGE_TOO_LARGE');}
export async function uploadChatImage(file:File,userId:string,threadId:string,messageId:string){
 validateChatImage(file);const path=`${userId}/${threadId}/${messageId}.${imageTypes[file.type]}`;
 const {error}=await supabase.storage.from('chat-media').upload(path,file,{contentType:file.type,upsert:false});
 if(error&&String((error as {statusCode?:string}).statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message))throw error;
 return 'chat-media:'+path;
}
export async function chatImageUrl(value:string){
 if(value.startsWith('chat-media:')){const {data,error}=await supabase.storage.from('chat-media').createSignedUrl(value.slice(11),300);if(error||!data?.signedUrl)throw error??new Error('CHAT_IMAGE_UNAVAILABLE');return data.signedUrl;}
 const url=new URL(value),base=new URL(import.meta.env.VITE_SUPABASE_URL??import.meta.env.SUPABASE_URL);if(url.origin!==base.origin||!url.pathname.startsWith('/storage/v1/object/public/meal-photos/'))throw new Error('CHAT_IMAGE_UNAVAILABLE');return url.href;
}
export async function saveChatImage(value:string){
 const url=await chatImageUrl(value),name=value.split('/').pop()?.split('?')[0]??'SHARek-image.jpg';
 if(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('ChatMedia'))return ChatMedia.saveImage({url,name});
 const response=await fetch(url);if(!response.ok)throw new Error('CHAT_IMAGE_UNAVAILABLE');const blob=await response.blob();if(!imageTypes[blob.type]||blob.size>10485760)throw new Error('IMAGE_TYPE');
 const file=new File([blob],name,{type:blob.type});
 const mobile=Capacitor.getPlatform()==='ios'||/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(mobile&&navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:'SHARek'});return {saved:false};}catch(e){if((e as Error).name==='AbortError')return {cancelled:true};throw e;}}
 const object=URL.createObjectURL(blob),link=document.createElement('a');link.href=object;link.download=name;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(object),60000);return {saved:true};
}
