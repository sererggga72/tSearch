import profileModel from './profile/profile';
import trackerModel from './tracker';
import searchFormModel from "./searchForm";
import searchFragModel from "./search/searchFrag";
import filterModel from "./filters";
import getSearchFragModelId from "../tools/getSearchFragModelId";
import exploreModel from "./explore/explore";
import page from "./page";
import {types, destroy, resolveIdentifier, getSnapshot, getRoot} from "mobx-state-tree";
import promisifyApi from "../tools/promisifyApi";
import loadTrackerModule from "../tools/loadTrackerModule";
import profileTemplateModel from "./profile/profileTemplate";
import historyModel from "./history";

const debug = require('debug')('indexModel');
const promiseLimit = require('promise-limit');

const oneLimit = promiseLimit(1);

/**
 * @typedef {{}} IndexM
 * Model:
 * @property {ProfileM} profile
 * @property {ProfileM[]} profiles
 * @property {TrackerM[]} trackers
 * @property {SearchFormM} searchForm
 * @property {SearchFragM} searchFrag
 * @property {FilterM} filter
 * @property {ExploreM} explore
 * @property {PageM[]} page
 * @property {HistoryM[]} history
 * Actions:
 * @property {function(string)} setState
 * @property {function(ProfileM[])} setProfiles
 * @property {function(string)} createSearch
 * @property {function} clearSearch
 * @property {function(string)} setProfile
 * @property {function(TrackerM)} putTrackerModule
 * @property {function(string)} removeProfile
 * Views:
 * @property {function:Promise} saveProfile
 * @property {function:Promise} saveProfiles
 * @property {function(string):ProfileM} getProfileTemplate
 * @property {Object} localStore
 * @property {function} onProfileChange
 * @property {function(string)} loadTrackerModule
 * @property {function} afterCreate
 * @property {function(string)} changeProfile
 * @property {function(string, string, string)} moveProfile
 */

const indexModel = types.model('indexModel', {
  state: types.optional(types.string, 'idle'), // idle, loading, ready, error
  profile: types.maybe(profileModel),
  profiles: types.optional(types.array(profileTemplateModel), []),
  trackers: types.optional(types.map(trackerModel), {}),
  searchForm: types.optional(searchFormModel, {}),
  searchFrag: types.maybe(searchFragModel),
  filter: types.optional(filterModel, {}),
  explore: types.optional(exploreModel, {}),
  page: types.optional(page, {}),
  history: types.optional(historyModel, {}),
}).actions(/**IndexM*/self => {
  return {
    setState(value) {
      self.state = value;
    },
    setProfiles(profiles) {
      self.profiles = profiles;
    },
    createSearch(query) {
      self.history.onQuery(query);
      self.searchFrag = {
        id: getSearchFragModelId(),
        query: query
      };
    },
    clearSearch() {
      if (self.searchFrag) {
        destroy(self.searchFrag);
      }
    },
    setProfile(name) {
      const profileItem = self.getProfileTemplate(name);
      if (profileItem) {
        self.profile = getSnapshot(profileItem);
      }
    },
    putTrackerModule(module) {
      self.trackers.put(module);
    },
    removeProfile(name) {
      const profile = self.getProfileTemplate(name);
      if (profile) {
        destroy(profile);
      }
      self.saveProfiles();
    },
  };
}).views(/**IndexM*/self => {
  const localStore = {
    set(key, value) {
      this[key] = value;
      promisifyApi('chrome.storage.local.set')({
        [key]: value,
      });
    }
  };

  return {
    saveProfile() {
      return oneLimit(() => {
        promisifyApi('chrome.storage.local.set')({profile: self.profile.name});
      });
    },
    saveProfiles() {
      return oneLimit(() => {
        promisifyApi('chrome.storage.local.set')({profiles: getSnapshot(self.profiles)});
      });
    },
    getProfileTemplate(name) {
      return name && resolveIdentifier(profileTemplateModel, self, name);
    },
    get localStore() {
      return localStore;
    },
    async loadTrackerModule(id) {
      let module = self.trackers.get(id);
      if (!module) {
        // await new Promise(resolve => setTimeout(resolve, 3000));
        const key = `trackerModule_${id}`;
        module = await promisifyApi('chrome.storage.local.get')({
          [key]: null
        }).then(storage => storage[key]);
        if (!module) {
          module = await loadTrackerModule(id);
          if (module) {
            await promisifyApi('chrome.storage.local.set')({[key]: module});
          }
        }
        if (module) {
          self.putTrackerModule(module);
        }
      }
      return module;
    },
    afterCreate() {
      self.setState('loading');
      promisifyApi('chrome.storage.local.get')({
        profile: null,
        profiles: [],
        sortByList: [{by: 'quality'}]
      }).then(storage => {
        self.localStore.sortByList = storage.sortByList;

        if (!storage.profiles.length) {
          storage.profiles.push({
            name: 'Default',
            trackers: [{
              id: 'rutracker',
              meta: {
                name: 'rutracker'
              }
            }, {
              id: 'nnmclub',
              meta: {
                name: 'nnmclub'
              }
            }, {
              id: 'rutracker1',
              meta: {
                name: 'rutracker1'
              }
            }]
          });
          storage.profiles.push({
            name: 'Default 2',
            trackers: [{
              id: 'nnmclub1',
              meta: {
                name: 'nnmclub1'
              }
            }]
          });
        }
        self.setProfiles(storage.profiles);

        let profile = self.getProfileTemplate(storage.profile);
        if (!profile) {
          profile = self.profiles[0];
        }
        self.setProfile(profile.name);
      }).then(() => {
        self.setState('ready');
      }).catch(err => {
        debug('index load error', err);
        self.setState('error');
      });
    },
    changeProfile(name) {
      self.setProfile(name);
      return self.saveProfile();
    },
    moveProfile(index, prevIndex, nextIndex) {
      const profiles = self.profiles.slice(0);
      const item = profiles[index];
      const prevItem = profiles[prevIndex];
      const nextItem = profiles[nextIndex];

      profiles.splice(index, 1);

      if (prevItem) {
        const pos = profiles.indexOf(prevItem);
        if (pos !== -1) {
          profiles.splice(pos + 1, 0, item);
        }
      } else
      if (nextItem) {
        const pos = profiles.indexOf(nextItem);
        if (pos !== -1) {
          profiles.splice(pos, 0, item);
        }
      } else {
        profiles.push(item);
      }

      self.setProfiles(profiles);
      return self.saveProfiles();
    },
  };
});

export default indexModel;