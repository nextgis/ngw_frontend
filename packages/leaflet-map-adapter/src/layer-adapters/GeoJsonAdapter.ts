import {
  CircleMarker,
  FeatureGroup,
  DomEvent,
  GeoJSON,
  DivIcon,
  Marker,
  Layer,
} from 'leaflet';
import { debounce, defined } from '@nextgis/utils';
import { isPaintCallback, isPaint } from '@nextgis/paint';
import { BaseAdapter } from './BaseAdapter';
import {
  PAINT,
  typeAlias,
  detectType,
  filterGeometries,
  convertMapClickEvent,
} from '../utils/utils';

import type { GeoJsonObject, Feature, Point } from 'geojson';
import type {
  CircleMarkerOptions,
  LeafletMouseEvent,
  LatLngExpression,
  GeoJSONOptions,
  PathOptions,
  LatLng,
  Path,
  Map,
} from 'leaflet';
import type {
  Paint,
  IconPaint,
  PathPaint,
  VectorAdapterLayerPaint,
} from '@nextgis/paint';
import type {
  VectorAdapterLayerType,
  GeoJsonAdapterOptions,
  VectorLayerAdapter,
  LngLatBoundsArray,
  OnLayerSelectType,
  LayerDefinition,
  DataLayerFilter,
  PopupOptions,
} from '@nextgis/webmap';

type LayerDef = LayerDefinition<Feature, Layer>;

export class GeoJsonAdapter
  extends BaseAdapter<GeoJsonAdapterOptions>
  implements VectorLayerAdapter<Map>
{
  layer: FeatureGroup;
  selected = false;

  private paint?: Paint;
  private selectedPaint?: Paint;
  private type?: VectorAdapterLayerType;

  private _layers: LayerDef[] = [];
  private _selectedLayers: LayerDef[] = [];
  private _filteredLayers: LayerDef[] = [];
  private _filterFun?: DataLayerFilter<Feature>;

  private $updateTooltip = debounce(() => {
    this.updateTooltip();
  }, 300);

  constructor(map: L.Map, options: GeoJsonAdapterOptions) {
    super(map, options);
    this.layer = new FeatureGroup([], { pane: this.pane });
  }

  addLayer(options: GeoJsonAdapterOptions): FeatureGroup<any> | undefined {
    this.options = options;
    this.paint = options.paint;

    this.selectedPaint = options.selectedPaint;
    options.paint = this.paint;

    if (options.data) {
      this.addData(options.data);
    }

    this._addMapMoveListener();

    return this.layer;
  }

  beforeRemove(): void {
    this._removeMapMoveListener();
  }

  select(findFeatureFun?: DataLayerFilter): void {
    if (findFeatureFun) {
      const def = this._layers.filter(findFeatureFun);
      def.forEach((x) => {
        this._selectLayer(x, 'api');
      });
    } else if (!this.selected) {
      this.selected = true;
      if (this.selectedPaint) {
        this.setPaintEachLayer(this.selectedPaint);
      }
    }
  }

  unselect(findFeatureFun?: DataLayerFilter): void {
    if (findFeatureFun) {
      const feature = this._layers.filter(findFeatureFun);
      feature.forEach((x) => {
        this._unSelectLayer(x.layer);
      });
    } else if (this.selected) {
      this.selected = false;
      if (this.paint) {
        this.setPaintEachLayer(this.paint);
      }
    }
  }

  getSelected(): LayerDefinition<Feature, LayerDef>[] {
    return this._selectedLayers.map((x) => {
      return { feature: x.feature, layer: x };
    });
  }

  getFiltered(): LayerDef[] {
    return this._filteredLayers;
  }

  filter(fun?: DataLayerFilter): LayerDef[] {
    // Some optimization
    this._filterFun = fun;
    // @ts-ignore
    const _map = this.layer._map;
    if (_map) {
      this.layer.remove();
    }
    const filteredLayers: LayerDef[] = [];
    this._layers.forEach(({ feature, layer }) => {
      if (layer) {
        const ok = fun ? fun({ feature, layer }) : true;
        if (ok) {
          this.layer.addLayer(layer);
          filteredLayers.push({ feature, layer });
        } else {
          this.layer.removeLayer(layer);
        }
      }
    });
    this._filteredLayers = filteredLayers;
    if (_map) {
      this.layer.addTo(_map);
    }
    return this._filteredLayers;
  }

  cleanFilter(): void {
    this.filter();
  }

  getLayers(): LayerDef[] {
    return this._layers.map(({ layer, feature }) => {
      const visible = layer && !!(layer as any)._map;
      return {
        feature,
        layer,
        visible,
        target: this,
      };
    });
  }

  clearLayer(cb?: (feature: Feature) => boolean): void {
    if (cb) {
      for (let fry = this._layers.length; fry--; ) {
        const def = this._layers[fry];
        if (def) {
          const { feature, layer } = def;
          if (feature && layer) {
            const exist = cb(feature);
            if (exist) {
              this.layer.removeLayer(layer);
              this._layers.splice(fry, 1);
            }
          }
        }
      }
    } else {
      this.layer.clearLayers();
      this._layers = [];
    }
  }

  setData(data: GeoJsonObject): void {
    this.clearLayer();
    this.addData(data);
  }

  addData(data: GeoJsonObject | false): void {
    const options = this.options;
    let geoJsonOptions: GeoJSONOptions | undefined;
    if (options) {
      if (data) {
        let type: VectorAdapterLayerType;

        if (!options.type) {
          const detectedType = detectType(data);
          type = typeAlias[detectedType];
        } else {
          type = options.type;
        }
        if (this.type && this.type !== type) {
          console.warn('no other data type than layer can be added');
          return;
        }
        this.type = type;

        data = filterGeometries(data, type);
        if (data) {
          geoJsonOptions = this.getGeoJsonOptions(options, type);
        }
      }
      new GeoJSON(data || undefined, geoJsonOptions);
    }
  }

  openPopup(findFeatureFun: DataLayerFilter, options?: PopupOptions): void {
    if (findFeatureFun) {
      const def = this._layers.filter(findFeatureFun);
      def.forEach((x) => {
        this._openPopup(x, options, 'api');
      });
    }
  }

  closePopup(findFeatureFun?: DataLayerFilter): void {
    const featuresToClosePopup = findFeatureFun
      ? this._layers.filter(findFeatureFun)
      : this._layers;

    featuresToClosePopup.forEach((x) => {
      this._closePopup(x);
    });
  }

  updateTooltip(layerDef?: LayerDefinition): void {
    if (layerDef) {
      this._updateTooltip(layerDef);
    } else {
      this.getLayers().forEach((x) =>
        this._updateTooltip({ feature: x.feature, layer: x.layer }),
      );
    }
  }

  getExtent(): LngLatBoundsArray | undefined {
    const bounds = this.layer.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (ne && sw) {
      return [sw.lng, sw.lat, ne.lng, ne.lat];
    }
  }

  private _updateTooltip(layerDef: LayerDef) {
    const { feature, layer } = layerDef;
    if (feature && layer && feature.properties && this.options.labelField) {
      layer.unbindTooltip();
      const message = feature.properties[this.options.labelField];
      if (message !== undefined) {
        const permanent = !this.options.labelOnHover;

        layer.bindTooltip(String(message), { permanent, sticky: false });
      }
    }
  }

  private async _openPopup(
    def: LayerDef,
    options: PopupOptions = {},
    type: OnLayerSelectType,
  ) {
    const { feature, layer } = def;
    const { minWidth, autoPan, maxWidth } = { minWidth: 300, ...options };
    const content = options.createPopupContent
      ? await options.createPopupContent({
          layer,
          feature,
          target: this,
          type,
        })
      : options.popupContent;
    if (content && layer) {
      const popup = layer.bindPopup(content, { minWidth, autoPan, maxWidth });
      setTimeout(() => {
        popup.openPopup();
      }, 0);
    }
  }

  private _closePopup(def: LayerDef) {
    if (def.layer) {
      def.layer.closePopup().unbindPopup();
    }
  }

  private setPaintEachLayer(paint: Paint) {
    this._layers.forEach((l) => {
      this.setPaint(l, paint);
    });
  }

  private setPaint(def: LayerDef, paint: Paint) {
    let style: VectorAdapterLayerPaint | undefined = undefined;
    const { layer, feature } = def;
    if (layer && feature) {
      if (isPaintCallback(paint)) {
        style = paint(feature);
      } else if (isPaint(paint)) {
        style = paint;
      }
      if (style) {
        if (this.type === 'point' && style.type === 'icon') {
          const marker = layer as Marker;
          const divIcon = this.createDivIcon(style);
          marker.setIcon(divIcon);
        } else if ('setStyle' in layer) {
          (layer as Path).setStyle(this.preparePaint(style));
        }
      }
    }
  }

  private preparePaint(paint: VectorAdapterLayerPaint): PathOptions {
    if (paint.type !== 'get-paint') {
      // const path: CircleMarkerOptions | PathOptions = paint as CircleMarkerOptions | PathOptions;
      // if (path.opacity) {
      //   path.fillOpacity = path.opacity;
      // }

      const paintAliases: [keyof PathOptions, keyof PathPaint][] = [
        // ['color', 'color'],
        ['color', 'strokeColor'],
        ['opacity', 'strokeOpacity'],
        ['stroke', 'stroke'],
        ['fillColor', 'fillColor'],
        ['fillOpacity', 'fillOpacity'],
        ['fill', 'fill'],
        ['weight', 'weight'],
      ];
      const aliases: [keyof PathOptions, keyof PathPaint][] =
        this.type === 'line'
          ? [
              ['color', 'strokeColor'],
              ['opacity', 'strokeOpacity'],
              ['weight', 'weight'],
            ]
          : paintAliases;

      const readyPaint: PathOptions & CircleMarkerOptions = {};

      if ('radius' in paint && typeof paint.radius === 'number') {
        readyPaint.radius = paint.radius;
      }
      aliases.forEach(([to, from]: [keyof PathOptions, keyof PathPaint]) => {
        const paintProp = (paint as PathPaint)[from];
        if (paintProp !== undefined) {
          Object.defineProperty(readyPaint, to, {
            enumerable: true,
            value: paintProp,
          });
        }
      });

      return readyPaint;
    }
    return PAINT;
  }

  private getGeoJsonOptions(
    options: GeoJsonAdapterOptions,
    type: VectorAdapterLayerType,
  ): GeoJSONOptions {
    const paint = options.paint;
    let lopt: GeoJSONOptions = {};

    if (typeof paint === 'function') {
      if (type === 'point') {
        // TODO: fix types (@geoman-io/leaflet-geoman-free)
        (lopt as any).pointToLayer = (
          feature: Feature<Point, any>,
          latLng: LatLng,
        ) => {
          const iconOpt = paint(feature);
          const pointToLayer = this.createPaintToLayer(iconOpt as IconPaint);
          return pointToLayer(feature, latLng);
        };
      } else {
        lopt = {
          style: (feature) => {
            if (feature) {
              return this.preparePaint({ ...PAINT, ...paint(feature) });
            } else {
              return this.preparePaint({ ...PAINT, type: 'path' });
            }
          },
        };
      }
    } else {
      lopt = this.createPaintOptions(paint as VectorAdapterLayerPaint, type);
    }

    lopt.onEachFeature = (feature: Feature, layer) => {
      // @ts-ignore
      layer.options.pane = this.pane;
      this._layers.push({ feature, layer });
      let ok = true;
      if (this._filterFun) {
        ok = this._filterFun({ feature, layer });
      }
      if (ok) {
        const { popup, popupOptions, selectable, interactive, selectOnHover } =
          this.options;
        // @ts-ignore
        layer.options.interactive = defined(interactive) ? interactive : true;
        this.layer.addLayer(layer);
        if (selectable) {
          if (selectOnHover) {
            layer.on('mouseover', () => {
              this._selectLayer({ feature, layer }, 'hover');
            });
            layer.on('mouseout', () => {
              this._unSelectLayer(layer);
            });
          } else {
            layer.on(
              'click',
              (e) => this._selectOnLayerClick(e as LeafletMouseEvent),
              this,
            );
          }
        }
        this._handleMouseEvents(layer);
        if (popup) {
          this._openPopup({ layer, feature }, popupOptions, 'api');
        }

        this._updateTooltip({ layer, feature });
      }
    };

    return lopt;
  }

  private _handleMouseEvents(layer: Layer) {
    const isSelected = (l: LayerDef) => this._selectedLayers.indexOf(l) !== -1;
    const createMouseOptions = (e: LeafletMouseEvent) => {
      const layer_ = e.target as LayerDef;
      return {
        layer: this,
        feature: layer_.feature,
        event: convertMapClickEvent(e),
        source: e,
      };
    };
    const { onClick, onLayerClick, onMouseOut, onMouseOver } = this.options;
    // TODO: remove backward compatibility for onLayerClick
    const onClick_ = onClick || onLayerClick;
    if (onClick_) {
      layer.on(
        'click',
        (e) => {
          onClick_({
            selected: isSelected(e.target),
            ...createMouseOptions(e as LeafletMouseEvent),
          });
        },
        this,
      );
    }
    if (onMouseOut) {
      layer.on(
        'mouseout',
        (e) => {
          onMouseOut(createMouseOptions(e as LeafletMouseEvent));
        },
        this,
      );
    }
    if (onMouseOver) {
      layer.on(
        'mouseover',
        (e) => {
          onMouseOver(createMouseOptions(e as LeafletMouseEvent));
        },
        this,
      );
    }
  }

  private _selectOnLayerClick(e: LeafletMouseEvent) {
    DomEvent.stopPropagation(e);
    const def = e.target as LayerDef;
    let isSelected = this._selectedLayers.indexOf(def) !== -1;
    if (isSelected) {
      if (this.options && this.options.unselectOnSecondClick) {
        this._unSelectLayer(def);
        isSelected = false;
      }
    } else {
      this._selectLayer(def, 'click');
      isSelected = true;
    }
  }

  private _selectLayer(def: LayerDef, type: OnLayerSelectType) {
    if (this.options && !this.options.multiselect) {
      this._selectedLayers.forEach((x) => this._unSelectLayer(x));
    }
    this._selectedLayers.push(def);
    this.selected = true;
    if (this.options) {
      if (this.options.selectedPaint && def.layer) {
        this.setPaint(def, this.options.selectedPaint);
      }
      if (this.options.popupOnSelect) {
        this._openPopup(def, this.options.popupOptions, type);
      }
      if (this.options.onSelect) {
        this.options.onSelect({
          type,
          layer: this,
          features: def.feature ? [def.feature] : [],
        });
      }
    }
  }

  private _unSelectLayer(layer: any) {
    const index = this._selectedLayers.indexOf(layer);
    if (index !== -1) {
      this._selectedLayers.splice(index, 1);
    }
    this.selected = this._selectedLayers.length > 0;
    if (this.options) {
      if (this.options.paint) {
        this.setPaint(layer, this.options.paint);
      }

      if (this.options.popupOnSelect) {
        this._closePopup(layer);
      }
    }
  }

  private createDivIcon(icon: IconPaint) {
    const { ...toLIconOpt } = icon;
    return new DivIcon({ className: '', ...toLIconOpt });
  }

  private createPaintToLayer(icon: IconPaint) {
    if (icon && icon.type) {
      if (icon.type === 'icon') {
        const iconClassName = icon.className;
        const html = icon.html;
        if (iconClassName || html) {
          return (geoJsonPoint: any, latlng: LatLngExpression) => {
            const divIcon = this.createDivIcon(icon);
            return new Marker(latlng, { icon: divIcon });
          };
        }
      } else if (icon.type === 'pin') {
        return (geoJsonPoint: any, latlng: LatLngExpression) => {
          // const divIcon = this.createDivIcon(icon);
          return new Marker(latlng);
        };
      }
    }
    return (geoJsonPoint: any, latlng: LatLngExpression) => {
      const p: any = PAINT;
      return new CircleMarker(latlng, this.preparePaint({ ...p, ...icon }));
    };
  }

  private createPaintOptions(
    paintOptions: VectorAdapterLayerPaint,
    type: VectorAdapterLayerType,
  ): GeoJSONOptions {
    const geoJsonOptions: GeoJSONOptions = {};
    const paint = (paintOptions && this.preparePaint(paintOptions)) || {};
    if (paintOptions) {
      geoJsonOptions.style = () => {
        return paint;
      };
    }
    if (type === 'point') {
      (geoJsonOptions as any).pointToLayer = this.createPaintToLayer(
        paintOptions as IconPaint,
      );
    } else if (type === 'line') {
      paint.stroke = true;
    }
    return geoJsonOptions;
  }

  private _addMapMoveListener() {
    const map = this.map;
    if (map) {
      if (this.options.labelField && !this.options.labelOnHover) {
        map.on('zoomend', this.$updateTooltip);
        map.on('moveend', this.$updateTooltip);
      }
    }
  }

  private _removeMapMoveListener() {
    this.map.off('zoomend', this.$updateTooltip);
    this.map.off('moveend', this.$updateTooltip);
  }
}
