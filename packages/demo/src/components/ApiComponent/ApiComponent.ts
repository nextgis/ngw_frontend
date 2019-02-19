import { Vue, Component, Prop } from 'vue-property-decorator';
import ClassItem from './ItemKinds/ClassItem.vue';

@Component({
  components: { ClassItem }
})
export class ApiComponent extends Vue {

  @Prop() api: any;
  @Prop() package: string;

  created() {
    // @ts-ignore
    hljs.initHighlightingOnLoad();
  }
}
