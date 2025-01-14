define([
    'backbone',
    'jquery',
    'js/view/basemap.js',
    'js/view/layers.js',
    'js/view/side-panel.js',
    'js/view/intro.js',
    'js/model/depth_class.js',
    'leafletWMSLegend',
    'leafletAwesomeIcon'
], function (Backbone, $, Basemap, Layers, SidePanelView, IntroView, DepthClassCollection, LeafletWMSLegend, leafletAwesomeIcon) {
    return Backbone.View.extend({
        defaultZoom: 5,
        wmsExposedBuildingsLegendURI: function (hazard_type) {
            return `${geoserverUrl}?${$.param({
                SERVICE: 'WMS',
                REQUEST: 'GetLegendGraphic',
                VERSION: '1.0.0',
                FORMAT: 'image/png',
                WIDTH: 20,
                HEIGHT: 20,
                LAYER: `${layerNamespace}${hazard_type}_exposed_buildings`,
                LEGEND_OPTIONS: 'fontName:Ubuntu;fontSize:12;fontAntiAliasing:true;forceLabels:on'
            })}`
        },
        wmsFloodDepthLegendURI: function (hazard_type) {
            return `${geoserverUrl}?${$.param({
                SERVICE: 'WMS',
                REQUEST: 'GetLegendGraphic',
                VERSION: '1.0.0',
                FORMAT: 'image/png',
                WIDTH: 20,
                HEIGHT: 20,
                LAYER: `${layerNamespace}${hazard_type}_forecast_layer`,
                LEGEND_OPTIONS: 'fontName:Ubuntu;fontSize:12;fontAntiAliasing:true;forceLabels:on'
            })}`
        },
        wmsExposedRoadsLegendURI: function (hazard_type) {
            return `${geoserverUrl}?${$.param({
                SERVICE: 'WMS',
                REQUEST: 'GetLegendGraphic',
                VERSION: '1.0.0',
                FORMAT: 'image/png',
                WIDTH: 20,
                HEIGHT: 20,
                LAYER: `${layerNamespace}${hazard_type}_exposed_roads`,
                LEGEND_OPTIONS: 'fontName:Ubuntu;fontSize:12;fontAntiAliasing:true;forceLabels:on'
            })}`
        },
        markers: [],
        exposed_road_layer: null,
        reportingPointMarkers: [],
        initialize: function () {
            // constructor
            this.map = L.map('map');
            this.basemap = new Basemap(this);
            this.layers = new Layers(this);
            this.layer_control = L.control.layers(
                this.basemap.basemaps,
                this.layers.groups, {position: 'topleft'});
            this.layer_control.addTo(this.map);
            this.depth_class_collection = new DepthClassCollection();
            this.depth_class_collection.fetch();
            this.initDraw();
            this.listenTo(dispatcher, 'map:redraw', this.redraw);
            this.listenTo(dispatcher, 'map:draw-geojson', this.drawGeojsonLayer);
            this.listenTo(dispatcher, 'map:remove-geojson', this.removeGeojsonLayer);
            this.map.fitWorld();
            let that = this;
            that.fetchBounds();

            // dispatcher registration
            dispatcher.on('map:draw-forecast-layer', this.drawForecastLayer, this);
            dispatcher.on('map:remove-forecast-layer', this.removeForecastLayer, this);
            dispatcher.on('map:show-map', this.showMap, this);
            dispatcher.on('map:hide-map', this.hideMap, this);
            dispatcher.on('map:fit-bounds', this.fitBounds, this);
            dispatcher.on('map:show-region-boundary', this.showRegionBoundary, this);
            dispatcher.on('map:show-exposed-buildings', this.showExposedBuildings, this);
            dispatcher.on('map:show-exposed-roads', this.showExposedRoads, this);
            dispatcher.on('map:fit-forecast-layer-bounds', this.fitForecastLayerBounds, this);
            dispatcher.on('map:add-marker', this.addMarker, this);
            dispatcher.on('map:remove-all-markers', this.removeAllMarkers, this);
        },
        fetchBounds: function(){
            let that=this;
            if(defaultInitialMapBounds.length === 0){
                AppRequest.get(
                    `${postgresUrl}rpc/kartoza_fba_global_extent`,
                    null,
                    {
                        Accept: 'application/vnd.pgrst.object+json'
                    }
                ).then(function (extent) {
                    // lat lon format
                    that.initBounds = [[extent.y_min, extent.x_min], [extent.y_max, extent.x_max]];
                    that.map.fitBounds(that.initBounds);
                });
            }
            else {
                this.initBounds = defaultInitialMapBounds
                this.map.fitBounds(defaultInitialMapBounds)
            }
        },
        addOverlayLayer: function(layer, name){
            this.layer_control.addOverlay(layer, name);
            layer.addTo(this.map);
        },
        removeOverlayLayer: function(layer){
            this.layer_control.removeLayer(layer);
            this.map.removeLayer(layer);
        },
        removeForecastLayer: function(){
            if(this.forecast_layer){
                this.removeOverlayLayer(this.forecast_layer);
                this.forecast_layer = null;
            }
            dispatcher.trigger('map:redraw');
            this.map.fitBounds(this.initBounds);
            if(resetView) {
                dispatcher.trigger('side-panel:open-welcome')
            }
            resetView = true;
        },
        showMap: function() {
            $(this.map._container).show();
            this.map._onResize();
            this.map.setZoom(this.defaultZoom);
        },
        hideMap: function () {
            dispatcher.trigger('flood:deselect-forecast');
            $(this.map._container).hide();
        },
        drawForecastLayer: function(forecast, callback){
            const that = this;
            // get zoom bbox
            forecast.fetchExtent()
                .then(function (extent) {
                    // create WMS layer
                    console.log('extent', extent)
                    let forecast_layer = forecast.leafletLayer();
                    console.log('forecast_layer',forecast_layer)
                    // add layer to leaflet
                    if(that.forecast_layer){
                        that.removeOverlayLayer(that.forecast_layer);
                    }
                    that.redraw();
                    that.addOverlayLayer(forecast_layer, 'Hazard Forecast');
                    // zoom to bbox
                    that.map.flyToBounds(extent.leaflet_bounds);
                    // register layer to view
                    that.forecast_layer = forecast_layer;
                    // reset region boundary and exposed flood maps because we are seeing different flood
                    that.showExposedRoads(null, null,null, null);
                    that.showRegionBoundary(null, null);
                    that.showExposedBuildings(null, null, null, null);
                    that.wmsFloodLegend = L.wmsLegend(that.wmsFloodDepthLegendURI(forecast.hazardTypeSlug()), that.map, 'wms-legend-icon fa fa-map-signs', 'bottomleft');
                    that.addLegendControl();
                    if(callback) {
                        callback();
                    }
                })

        },
        fitForecastLayerBounds: function (forecast, callback) {
            let that = this;
            forecast.fetchExtent()
                .then(function (extent) {
                    that.map.fitBounds(extent.leaflet_bounds);
                })
        },
        redraw: function () {
            if(this.generalLegendControl){
                this.map.removeControl(this.generalLegendControl)
            }
            if(this.wmsExposedBuildingsLegend) {
                this.map.removeControl(this.wmsExposedBuildingsLegend)
            }
            if(this.wmsFloodLegend){
                this.map.removeControl(this.wmsFloodLegend)
            }
            if(this.wmsExposedRoadsLegend){
                this.map.removeControl(this.wmsExposedRoadsLegend)
            }
            $.each(this.layers.layers, function (index, layer) {
                layer.addLayer();
            });
        },
        initDraw: function () {
            /** initiate leaflet draw **/
            let that = this;
            this.drawGroup = new L.FeatureGroup();
            this.drawControl = new L.Control.Draw({
                draw: {
                    polygon: true,
                    polyline: false,
                    circlemarker: false,
                    marker: false,
                    circle: false,
                    rectangle: false
                },
                edit: {
                    featureGroup: this.drawGroup,
                    edit: false
                }
            });
            
            $('#draw-flood').click(function () {
                if ($(this).hasClass('enable')) {
                    that.map.removeControl(that.drawControl);
                    $(this).removeClass('enable');
                } else {
                    that.map.addControl(that.drawControl);
                    $(this).addClass('enable');
                }
            });
            
            this.map.addLayer(this.drawGroup);

            this.map.on('draw:created', (e) => {
                that.drawGroup.clearLayers();
                that.drawGroup.addLayer(e.layer);
                let $drawFormWrapper = $('#draw-flood-form').parent();
                let $drawFormParent = $drawFormWrapper.parent();
                $drawFormParent.prev().hide();
                $drawFormWrapper.show();
                $drawFormParent.show("slide", { direction: "right" }, 400);

                $('#cancel-draw').click(function () {
                    that.drawGroup.removeLayer(e.layer);
                    $('#draw-flood').removeClass('enable');
                    that.map.removeControl(that.drawControl);
                });

                $("#draw-form").submit(function(e){
                    e.preventDefault();
                    dispatcher.trigger('map:update-polygon', that.postgrestFilter());
                    $('#draw-flood').removeClass('enable');
                    that.map.removeControl(that.drawControl);
                    $drawFormWrapper.hide();
                    $drawFormParent.hide("slide", { direction: "right" }, 200);
                    $drawFormParent.prev().show("slide", { direction: "right" }, 400);
                });
            });

            this.map.on('draw:deleted', (evt) => {
                dispatcher.trigger('map:update-polygon', that.postgrestFilter());
                that.redraw();
            });

            this.addReportingPoints();

            this.side_panel = new SidePanelView();
            this.intro_view = new IntroView({
                'skipIntro': true
            });
        },
        polygonDrawn: function () {
            if (this.drawGroup && this.drawGroup.getLayers().length > 0) {
                let locations = [];
                $.each(this.drawGroup.getLayers()[0].getLatLngs()[0], (index, latLng) => {
                    locations.push(latLng.lng + ' ' + latLng.lat)
                });

                // add first point to make it closed
                let firstPoint = this.drawGroup.getLayers()[0].getLatLngs()[0];
                locations.push(firstPoint[0].lng + ' ' + firstPoint[0].lat)
                return locations
            } else {
                return null;
            }
        },
        cqlFilter: function () {
            /** get cql from drawn polygon **/
            if (!this.layers) {
                return null;
            }
            let flood_id = null;
            try {
                flood_id = floodCollectionView.displayed_flood.id;
            }catch (err){

            }

            if (flood_id !== null) {
                return "flood_id=" + flood_id;
            } else {
                return null
            }
        },
        postgrestFilter: function () {
            /** get postgrest from drawn polygon **/
            let locations = this.polygonDrawn();
            if (locations) {
                return 'SRID=4326;MULTIPOLYGON(((' + locations.join(',') + ')))';
            } else {
                return null
            }
        },
        drawGeojsonLayer: function (polygon) {
            let that = this;
            if(that.geojson_layer){
                that.map.removeLayer(that.geojson_layer)
            }
            this.redraw();
            that.geojson_layer = new L.GeoJSON(polygon).addTo(that.map);
            that.map.fitBounds(that.geojson_layer.getBounds());
            dispatcher.trigger('side-panel:open-dashboard');
        },
        removeGeojsonLayer: function () {
            let that = this;
            if(that.geojson_layer){
                that.map.removeLayer(that.geojson_layer)
            }
            this.redraw();
            that.map.fitBounds(this.initBounds);
            this.map.setZoom(this.defaultZoom);
            dispatcher.trigger('dashboard:reset')
        },
        fitBounds: function (bounds) {
            this.map.fitBounds(bounds)
        },
        showRegionBoundary: function (region, region_id) {
            if(this.region_layer){
                this.removeOverlayLayer(this.region_layer);
                this.region_layer = null;
            }
            dispatcher.trigger('map:redraw');

            if(region == null && region_id == null){
                return;
            }

            id_field_key = {
                country: 'country_code',
                district: 'dc_code',
                sub_district: 'sub_dc_code'
            }

            id_field = id_field_key[region]

            this.region_layer = L.tileLayer.wms(
                geoserverUrl,
                {
                    layers: `${layerNamespace}${region}_boundary`,
                    format: 'image/png',
                    transparent: true,
                    srs: 'EPSG:4326',
                    tiled: true,
                    filter: toXmlAndFilter({[id_field]: region_id})
                });
            this.region_layer.setZIndex(20);
            this.addOverlayLayer(this.region_layer, 'Administrative Boundary');
        },
        showExposedBuildings: function (forecast_id, hazard_type, region, region_id) {
            if(this.exposed_buildings_layer){
                this.removeOverlayLayer(this.exposed_buildings_layer);
            }
            dispatcher.trigger('map:redraw');

            if(region_id === 'main'){
                return;
            }

            if(region == null && region_id == null){
                return;
            }

            let label = `Exposed Buildings`
            let filter = {
                flood_event_id: forecast_id
            }
            filter[id_key[region]] = region_id
            this.exposed_buildings_layer = L.tileLayer.wms(
                geoserverUrl,
                {
                    layers: `${layerNamespace}${hazard_type}_exposed_buildings`,
                    format: 'image/png',
                    transparent: true,
                    srs: 'EPSG:4326',
                    tiled: true,
                    filter: toXmlAndFilter(filter)
                }
            );
            this.exposed_buildings_layer.setZIndex(10);
            this.addOverlayLayer(this.exposed_buildings_layer, label);
            this.wmsExposedBuildingsLegend = L.wmsLegend(this.wmsExposedBuildingsLegendURI(hazard_type), this.map, 'wms-legend-icon fa fa-binoculars', 'bottomleft');
            this.addLegendControl();
        },
        showExposedRoads: function (forecast_id, hazard_type, region, region_id) {
            if(this.exposed_road_layer){
                this.removeOverlayLayer(this.exposed_road_layer);
            }

            dispatcher.trigger('map:redraw');

            if(region_id === 'main'){
                return;
            }

            if(region == null && region_id == null){
                return;
            }

            let filter = {
                flood_event_id: forecast_id
            }
            filter[id_key[region]] = region_id
            this.exposed_road_layer = L.tileLayer.wms(
                geoserverUrl,
                {
                    layers: `${layerNamespace}${hazard_type}_exposed_roads`,
                    format: 'image/png',
                    transparent: true,
                    srs: 'EPSG:4326',
                    tiled: true,
                    filter: toXmlAndFilter(filter),
                }
            );
            this.exposed_road_layer.setZIndex(3);
            this.addOverlayLayer(this.exposed_road_layer, 'Exposed roads');
            this.wmsExposedRoadsLegend = L.wmsLegend(this.wmsExposedRoadsLegendURI(hazard_type), this.map, 'wms-legend-icon fa fa-road', 'bottomright');
            this.addLegendControl();
        },
        addMarker: function (centroid, trigger_status) {
            if(centroid) {
                let that = this;
                let icon = that.getIcon(trigger_status);
                let marker = L.marker(centroid, {icon: icon}).addTo(that.map);
                this.markers.push(marker)
            }
        },
        getIcon: function (colour_code) {
            let dictColour = {
                0: 'green',
                1: 'orange',
                2: 'red',
                3: 'darkred',
            };

            let icon = L.AwesomeMarkers.icon({
                prefix: 'fa',
                icon: 'crosshairs',
                markerColor: dictColour[colour_code]
              });

            return icon
        },
        removeAllMarkers: function () {
            let that = this;
            if(that.markers.length > 0){
                $.each(that.markers, function (index, marker) {
                    that.map.removeLayer(marker)
                })
            }
        },
        addLegendControl: function () {
            let that = this;
            L.Control.CustomLegendButton = L.Control.extend({
                onAdd: function(map) {
                    var el = L.DomUtil.create('div', 'leaflet-bar leaflet-control-wms-legend general-legend-control legend-active');
                    el.innerHTML = '<i class="fa fa-map wms-legend-icon"></i>';
                    L.DomEvent.on(el, 'click', this._click, this);
                    el.click();
                    return el;
                },
                _click: function (e) {
                    L.DomEvent.stopPropagation(e);
                    L.DomEvent.preventDefault(e);
                    let $container = $('.general-legend-control');
                    if($container.hasClass('legend-active')){
                        $container.removeClass('legend-active');
                        if(that.wmsExposedBuildingsLegend) {
                            that.map.removeControl(that.wmsExposedBuildingsLegend)
                        }
                        if(that.wmsFloodLegend){
                            that.map.removeControl(that.wmsFloodLegend)
                        }
                        if(that.wmsExposedRoadsLegend){
                            that.map.removeControl(that.wmsExposedRoadsLegend)
                        }
                    }else {
                        $container.addClass('legend-active');
                        if(that.wmsExposedBuildingsLegend) {
                            that.map.addControl(that.wmsExposedBuildingsLegend)
                        }
                        if(that.wmsFloodLegend){
                            that.map.addControl(that.wmsFloodLegend)
                        }
                        if(that.wmsExposedRoadsLegend){
                            that.map.addControl(that.wmsExposedRoadsLegend)
                        }
                    }
                }
            });

            this.generalLegendControl = new L.Control.CustomLegendButton();
            this.generalLegendControl.options.position = 'topleft';
            this.map.addControl(this.generalLegendControl);

        },
        addReportingPoints: function () {
            let that = this;
            $.ajax({
                url: `${geoserverUrl}?${$.param({
                        SERVICE: 'WFS',
                        VERSION: '1.0.0',
                        REQUEST: 'GetFeature',
                        TYPENAME: `${layerNamespace}reporting_point`,
                        MAXFEATURES: 50,
                        OUTPUTFORMAT: 'application/json'
                    })}`,
                success: function (data) {
                    if(data['features']) {
                        let reporting_points = data['features'];
                        for(let i=0; i<reporting_points.length; i++){
                            let icon = L.AwesomeMarkers.icon({
                                prefix: 'fa',
                                icon: 'fa-life-ring',
                                markerColor: 'cadetblue'
                            });
                            let marker = L.marker(
                                [reporting_points[i]['geometry']['coordinates'][1], reporting_points[i]['geometry']['coordinates'][0]], {
                                    icon: icon
                                }).addTo(that.map).bindTooltip("Reporting point: " + reporting_points[i]['properties']['name']);
                            that.reportingPointMarkers.push(marker)
                        }
                    }else {
                        console.log('Reporting point data are not found.')
                    }
                }
            })
        }
    });
});
