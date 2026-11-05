declare namespace google {
  namespace maps {
    class Map {
      constructor(el: HTMLElement, opts: MapOptions);
      setCenter(latlng: LatLngLiteral): void;
      setZoom(zoom: number): void;
      getCenter(): LatLng;
      getZoom(): number;
      panTo(latlng: LatLngLiteral): void;
      setOptions(opts: MapOptions): void;
      fitBounds(bounds: LatLngBoundsLiteral, padding?: number): void;
      addListener(event: string, handler: () => void): void;
    }
    class Marker {
      constructor(opts: MarkerOptions);
      setMap(map: Map | null): void;
      setPosition(latlng: LatLngLiteral): void;
      getPosition(): LatLng;
      addListener(event: string, handler: () => void): void;
      setIcon(icon: string | Icon | Symbol): void;
      setLabel(label: string | MarkerLabel): void;
      setZIndex(z: number): void;
    }
    class Circle {
      constructor(opts: CircleOptions);
      setMap(map: Map | null): void;
      setCenter(latlng: LatLngLiteral): void;
      setRadius(radius: number): void;
    }
    class InfoWindow {
      constructor(opts?: InfoWindowOptions);
      open(map: Map, marker?: Marker): void;
      close(): void;
      setContent(content: string): void;
    }
    class LatLngBounds {
      constructor();
      extend(latlng: LatLngLiteral): void;
    }
    class Geocoder {
      constructor();
      geocode(request: GeocoderRequest, callback: (results: GeocoderResult[], status: string) => void): void;
    }
    class PlacesService {
      constructor(map: Map);
      findPlaceFromQuery(request: FindPlaceRequest, callback: (results: PlaceResult[], status: string) => void): void;
      textSearch(request: TextSearchRequest, callback: (results: PlaceResult[], status: string) => void): void;
    }
    interface MapOptions {
      center?: LatLngLiteral;
      zoom?: number;
      mapTypeId?: string;
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      gestureHandling?: string;
      styles?: MapStyle[];
      clickableIcons?: boolean;
    }
    interface MarkerOptions {
      position?: LatLngLiteral;
      map?: Map | null;
      title?: string;
      icon?: string | Icon | Symbol;
      label?: string | MarkerLabel;
      zIndex?: number;
    }
    interface CircleOptions {
      map?: Map;
      center?: LatLngLiteral;
      radius?: number;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
    }
    interface InfoWindowOptions {
      content?: string;
    }
    interface Icon {
      url: string;
      scaledSize?: Size;
      anchor?: Point;
      origin?: Point;
    }
    interface Symbol {
      path: string;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWeight?: number;
      scale?: number;
      anchor?: Point;
    }
    interface Size { width: number; height: number; }
    interface Point { x: number; y: number; }
    interface MarkerLabel { text: string; color?: string; fontSize?: string; fontWeight?: string; className?: string; }
    interface LatLng { lat(): number; lng(): number; }
    interface LatLngLiteral { lat: number; lng: number; }
    interface LatLngBoundsLiteral { north: number; south: number; east: number; west: number; }
    interface GeocoderRequest { address?: string; location?: LatLngLiteral; }
    interface GeocoderResult { formatted_address: string; geometry: { location: LatLng; }; }
    interface FindPlaceRequest { query: string; fields: string[]; }
    interface TextSearchRequest { query: string; location?: LatLngLiteral; radius?: number; }
    interface PlaceResult { name: string; formatted_address: string; geometry: { location: LatLng; }; }
    interface MapStyle { featureType?: string; elementType?: string; stylers: { [key: string]: string }; }
  }
}

interface Window {
  google?: typeof google;
  __googleMapsLoader?: Promise<void>;
}
