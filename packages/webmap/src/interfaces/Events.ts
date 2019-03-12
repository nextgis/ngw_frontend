/**
 * @module webmap
 */

import { WebMap } from '../WebMap';
import { MapAdapter, MapClickEvent } from './MapAdapter';
import { LayerAdapter, OnLayerClickOptions } from './LayerAdapter';
import { LngLatArray } from './BaseTypes';

export interface WebMapEvents {
  'build-map': MapAdapter;
  'create': WebMap;

  'click': MapClickEvent;
  'zoom-end': MapAdapter;
  'move-end': MapAdapter;

  'layer:pre-add': {adapter: LayerAdapter, options: any};
  'layer:add': LayerAdapter;

  'layer:pre-remove': LayerAdapter;
  'layer:remove': LayerAdapter;

  'layer:pre-show': LayerAdapter;
  'layer:show': LayerAdapter;

  'layer:pre-hide': LayerAdapter;
  'layer:hide': LayerAdapter;

  'layer:click': OnLayerClickOptions;
}
