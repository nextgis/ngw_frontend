import { Vue, Component, Prop, Watch } from 'vue-property-decorator';
import NgwMap from '@nextgis/ngw-map';
import { ResourceAdapter } from '@nextgis/ngw-kit';
import { TreeGroup, TreeLayer } from '@nextgis/ngw-connector';

interface VueTreeItem {
  id: string;
  name: string;
  children?: VueTreeItem[];
}

@Component
export class NgwLayersList extends Vue {
  @Prop({ type: NgwMap }) ngwMap!: NgwMap;

  items: VueTreeItem[] = [];

  selection: string[] = [];

  private __updateItems?: () => Promise<void>;

  @Watch('selection')
  setVisibleLayers() {
    const layers = this.ngwMap.getLayers();
    for (const l in layers) {
      this.ngwMap.toggleLayer(l, this.selection.indexOf(l) !== -1);
    }
  }

  mounted() {
    const __updateItems = () => this.updateItems();
    this.__updateItems = __updateItems;
    this.ngwMap.onLoad().then(() => {
      this.updateItems();

      this.ngwMap.emitter.on('layer:add', __updateItems);
      this.ngwMap.emitter.on('layer:remove', __updateItems);
    });
  }

  beforeDestroy() {
    if (this.__updateItems) {
      this.ngwMap.emitter.off('layer:add', this.__updateItems);
      this.ngwMap.emitter.off('layer:remove', this.__updateItems);
    }
  }

  private async updateItems() {
    this.selection = [];
    const ngwLayers = await this.ngwMap.getNgwLayers();
    this.items = Object.keys(ngwLayers)
      .map(x => ngwLayers[x])
      .sort((a, b) => {
        const aOrder = (a.layer.options && a.layer.options.order) || 0;
        const bOrder = (b.layer.options && b.layer.options.order) || 0;
        return aOrder - bOrder;
      })
      .map(x => {
        const layer: ResourceAdapter = x.layer;
        const name = (layer.item && layer.item.resource.display_name) || String(layer.id);
        const item: VueTreeItem = {
          id: layer.id || '',
          name,
          children: []
        };

        const webMap = layer.item && layer.item.webmap;
        if (webMap) {
          item.children = this._craeteWebMapTree(webMap.root_item.children);
        }
        if (this.ngwMap.isLayerVisible(x.layer)) {
          this.selection.push(item.id);
        }
        return item;
      });
  }

  private _craeteWebMapTree(items: Array<TreeGroup | TreeLayer>) {
    return items.map(x => {
      const item: VueTreeItem = {
        id: String(x.id),
        name: x.display_name || String(x.id)
      };
      if (x.item_type === 'group' && x.children) {
        item.children = this._craeteWebMapTree(x.children);
      }
      return item;
    });
  }
}
