// 페이지 로드 시 실행
$(document).ready(function () {
    // === 상단 상수 (여기서만 값 조정) ===
    var ICON_SIZE = 64;   // 드롭 아이콘 표준 뷰포트(px)
    var ICON_PAD = 6;    // 테두리와 콘텐츠 사이 여백(px)
    var GRID_SIZE = 20;   // 그리드 간격(px)
    var SNAP_THRESHOLD = 6;    // 스냅 허용 오차(px)
    var CLAMP_DEFAULT = 'soft';   // 'soft' | 'hard' | 'none'
    var SNAP_DEFAULT = false;    // 초기 스냅 체크 여부
    var GRID_MOVE_DEFAULT = false;  // 초기 그리드이동 체크 여부
    var SVG_NS = 'http://www.w3.org/2000/svg';

    // (A) 뷰 줌 한계
    var ZOOM_MIN = 0.3;
    var ZOOM_MAX = 5;

    // (B) 아이템 스케일 한계 (사실상 무제한에 가깝게)
    var SCALE_MIN = 0.01;
    var SCALE_MAX = 1000;

    // 월드(작업면) 크기와 줌
    var WORLD_W = 4000;   // 필요시 조절
    var WORLD_H = 3000;
    var zoom = 1;

    var _itemAnchors = {}; // itemId -> [{connId, end:'start'|'end'}]

    // === 연결(폴리라인) 상태 ===
    var connect = { active: false, points: [], fromItemId: null, previewItem: null, previewPolyline: null };


    // === Quick Menu ===
    var _qm = { anchor: null }; // 현재 대상 아이템

    function startConnect($from) {
        cancelConnect();
        connect.active = true;
        connect.points = [];
        connect.fromItemId = $from.data('id');
        var p0 = getItemCenter($from);
        connect.points.push(p0);

        // === 미리보기(점선 폴리라인) - SVG 네임스페이스로 작성 ===
        var $item = $('<div class="canvas-item connection-item preview" data-type="connection"></div>')
            .css({ left: 0, top: 0, 'z-index': 99999 });

        // svg
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', '0 0 ' + WORLD_W + ' ' + WORLD_H);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.width = WORLD_W + 'px';
        svg.style.height = WORLD_H + 'px';

        // g
        var g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'icon-root');

        // polyline (점선 미리보기)
        var pl = document.createElementNS(SVG_NS, 'polyline');
        pl.setAttribute('class', 'connection-polyline');
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', '#0ea5e9');
        pl.setAttribute('stroke-width', '2');
        pl.setAttribute('stroke-dasharray', '6,6');
        pl.setAttribute('vector-effect', 'non-scaling-stroke');
        pl.setAttribute('points', p0.x + ',' + p0.y);

        g.appendChild(pl);
        svg.appendChild(g);
        $item.append(svg);
        $('#world').append($item);

        connect.previewItem = $item;
        connect.previewPolyline = pl; // ← DOM 노드(네임스페이스 OK)
        $('#canvas').addClass('connect-mode');
    }


    function registerConnectionToItem(itemId, connId, end) {
        _itemAnchors[itemId] = _itemAnchors[itemId] || [];
        _itemAnchors[itemId].push({ connId, end });
    }
    function unregisterConnectionFromItem(itemId, connId, end) {
        var arr = _itemAnchors[itemId]; if (!arr) return;
        _itemAnchors[itemId] = arr.filter(a => !(a.connId === connId && a.end === end));
    }
    function updateAttachedConnectionsForItem($item) {
        var id = $item.data('id');
        var refs = _itemAnchors[id]; if (!refs || !refs.length) return;
        var c = getItemCenter($item);
        refs.forEach(ref => {
            var $conn = $('.connection-item[data-id="' + ref.connId + '"]');
            if (!$conn.length) return;
            var data = $conn.data('conn'); if (!data) return;
            if (ref.end === 'start') data.points[0] = { x: c.x, y: c.y };
            else data.points[data.points.length - 1] = { x: c.x, y: c.y };
            data.poly.setAttribute('points', data.points.map(p => p.x + ',' + p.y).join(' '));
            if ($conn.hasClass('is-selected')) applySelectionOverlay($conn);
        });
        if (window._minimap) window._minimap.draw();
    }

    function updatePreviewTo(clientX, clientY) {
        if (!connect.active || !connect.previewPolyline) return;
        var p = clientToWorld(clientX, clientY);
        var pts = connect.points.concat([p]).map(pt => pt.x + ',' + pt.y).join(' ');
        connect.previewPolyline.setAttribute('points', pts);
    }

    function addVertexAt(clientX, clientY) {
        if (!connect.active) return;
        var p = clientToWorld(clientX, clientY);
        connect.points.push(p);
        updatePreviewTo(clientX, clientY);
    }

    function finishConnectToTarget($target) {
        var attachStart = { type: 'item', id: connect.fromItemId };
        var attachEnd = null;
        var pts = connect.points.slice();

        if ($target && $target.length) {
            var tc = getItemCenter($target);
            pts.push(tc);
            attachEnd = { type: 'item', id: $target.data('id') };
        }

        if (connect.previewItem) connect.previewItem.remove();

        var $conn = createConnection(pts, attachStart, attachEnd, { selectConnection: true });
        applyStyleToItem($conn, getCurrentStyle()); // 현재 스타일 적용

        // ★ 연결 완료 후: 시작/끝 아이템을 선택 상태로
        clearSelection();
        var $from = $('.canvas-item[data-id="' + connect.fromItemId + '"]');
        if ($from.length) { $from.addClass('is-selected'); applySelectionOverlay($from); }
        if ($target && $target.length) { $target.addClass('is-selected'); applySelectionOverlay($target); }

        // ✅ 연결 모드 종료 (이거 빠져있어서 다음 클릭이 계속 '점 추가'로 들어감)
        cancelConnect();
    }

    function cancelConnect() {
        if (connect.previewItem) connect.previewItem.remove();
        $('#canvas').removeClass('connect-mode');
        $('body').removeClass('no-select');              // ← 안전망
        $('.canvas-item').removeClass('is-rotating is-dragging'); // ← 안전망
        connect = { active: false, points: [], fromItemId: null, previewItem: null, previewPolyline: null };
    }

    // 실제 연결 아이템 생성
    function createConnection(points, attachStart, attachEnd, opts) {
        opts = opts || {};
        var id = 'conn_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

        var $item = $('<div>', {
            class: 'canvas-item connection-item',
            'data-id': id,
            'data-type': 'connection'
        }).css({ left: 0, top: 0 });

        // svg (세계 좌표)
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('viewBox', '0 0 ' + WORLD_W + ' ' + WORLD_H);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.width = WORLD_W + 'px';
        svg.style.height = WORLD_H + 'px';
        svg.style.pointerEvents = 'none';              // ★ 빈 영역 클릭 투명화

        var g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'icon-root');

        // polyline
        var pl = document.createElementNS(SVG_NS, 'polyline');
        pl.setAttribute('class', 'connection-polyline');
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', '#0ea5e9');
        pl.setAttribute('stroke-width', '2');
        pl.setAttribute('vector-effect', 'non-scaling-stroke');
        pl.setAttribute('points', points.map(p => p.x + ',' + p.y).join(' '));
        pl.setAttribute('pointer-events', 'stroke');   // ★ 선만 클릭 가능

        g.appendChild(pl);
        svg.appendChild(g);
        $item.append(svg);
        $('#world').append($item);

        var data = {
            points: points.slice(),
            attachStart: attachStart || null,
            attachEnd: attachEnd || null,
            poly: pl
        };
        $item.data('conn', data);

        if (attachStart && attachStart.type === 'item') registerConnectionToItem(attachStart.id, id, 'start');
        if (attachEnd && attachEnd.type === 'item') registerConnectionToItem(attachEnd.id, id, 'end');

        // clearSelection();
        // $item.addClass('is-selected');
        // applySelectionOverlay($item);
        // ★ 기본값: 연결을 자동 선택하지 않음 (필요 시 opts.selectConnection=true)
        if (opts.selectConnection) {
            clearSelection();
            $item.addClass('is-selected');
            applySelectionOverlay($item);
        }
        // 스타일바 값 반영
        applyConnectionStyle($item, getCurrentStyle());

        if (window._minimap) window._minimap.draw();
        return $item;
    }

    function pickTopNonConnectionItem(clientX, clientY) {
        var list = document.elementsFromPoint
            ? document.elementsFromPoint(clientX, clientY)
            : [document.elementFromPoint(clientX, clientY)];
        for (var i = 0; i < list.length; i++) {
            var $it = $(list[i]).closest('.canvas-item');
            if ($it.length && !$it.hasClass('preview') && $it.attr('data-type') !== 'connection') return $it;
        }
        return null;
    }


    function bindConnectMode() {
        var $canvas = $('#canvas');

        // 마우스 이동 → 미리보기 갱신
        $canvas.on('mousemove.connect', function (e) {
            if (connect.active) updatePreviewTo(e.clientX, e.clientY);
        });

        // ✅ 연결 모드에서 아이템을 직접 눌렀다면 거기서 즉시 종료
        $canvas.on('mousedown.connectItem', '.canvas-item', function (e) {
            if (!connect.active || e.which !== 1) return;
            var $it = $(this);
            if ($it.hasClass('preview')) return;
            if ($it.attr('data-type') === 'connection') return; // 선은 제외
            if ($it.data('id') === connect.fromItemId) { e.preventDefault(); e.stopPropagation(); return; }
            finishConnectToTarget($it);
            e.preventDefault(); e.stopPropagation();
        });

        // 좌클릭: 빈곳이면 꼭짓점 추가, 아이템이면 완료
        $canvas.on('mousedown.connect', function (e) {
            if (!connect.active || e.which !== 1) return;

            // 화면 좌표로 실제 맨 위 요소를 직접 찍어서 찾기
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var $hitItem = $(el).closest('.canvas-item');
            // var $hitItem = pickTopNonConnectionItem(e.clientX, e.clientY);
            var isValidTarget =
                $hitItem.length &&
                !$hitItem.hasClass('preview') &&          // 프리뷰 제외
                $hitItem.attr('data-type') !== 'connection'; // 연결 아이템 제외

            if (isValidTarget) {
                if ($hitItem.data('id') !== connect.fromItemId) finishConnectToTarget($hitItem);
            } else {
                addVertexAt(e.clientX, e.clientY); // 빈곳이면 꼭짓점 추가
            }
            e.preventDefault(); e.stopPropagation();
        });

        // ESC 취소
        $(window).on('keydown.connect', function (e) {
            if (e.key === 'Escape' && connect.active) cancelConnect();
        });

        // 캔버스 빈곳 더블클릭 → 현재까지의 꼭짓점으로 연결 종료(attachEnd 없음)
        $('#canvas').on('dblclick.connect', function (e) {
            if (!connect.active) return;
            // 마지막 지점(더블클릭 지점)도 꼭짓점으로 찍어주고 종료
            addVertexAt(e.clientX, e.clientY);
            finishConnectToTarget(null);
            e.preventDefault();
            e.stopPropagation();
        });
    }


    function clientToWorld(clientX, clientY) {
        var $canvas = $('#canvas');
        var rect = $canvas[0].getBoundingClientRect();
        var z = getZoom();
        var cx = clientX - rect.left;
        var cy = clientY - rect.top;
        return {
            x: ($canvas.scrollLeft() + cx) / z,
            y: ($canvas.scrollTop() + cy) / z
        };
    }

    function getItemCenter($it) {
        var left = parseFloat($it.css('left')) || 0;
        var top = parseFloat($it.css('top')) || 0;
        var sx = Math.abs($it.data('scaleX') || 1);
        var sy = Math.abs($it.data('scaleY') || 1);
        var w = ICON_SIZE * sx, h = ICON_SIZE * sy;
        return { x: left + w / 2, y: top + h / 2 };
    }


    function hideQuickMenu() {
        var $m = $('#quickMenu');
        $m.attr('aria-hidden', 'true');
        _qm.anchor = null;
    }

    function positionQuickMenu($item) {
        var $m = $('#quickMenu');
        var cont = $('.panel-bottom')[0];
        if (!$m.length || !cont) return;

        // 기준 컨테이너 기준 좌표
        var ir = $item[0].getBoundingClientRect();
        var cr = cont.getBoundingClientRect();

        // 기본 위치: 아이템 우측에 살짝
        var x = (ir.right - cr.left) + 8;
        var y = (ir.top - cr.top);

        // 먼저 보이게 해서 크기 측정
        $m.css({ left: x, top: y }).attr('aria-hidden', 'false');
        var mw = $m.outerWidth();
        var mh = $m.outerHeight();
        var cw = cr.width;
        var ch = cr.height;

        // 우측 넘침 → 왼쪽으로 붙이기
        if (x + mw > cw - 8) x = Math.max(8, (ir.left - cr.left) - mw - 8);
        // 하단 넘침 → 위로 올리기
        if (y + mh > ch - 8) y = Math.max(8, ch - mh - 8);

        $m.css({ left: x, top: y });
    }

    function showQuickMenu($item) {
        _qm.anchor = $item;
        positionQuickMenu($item);
    }


    function getZoom() { return zoom; }
    function clampZoom(z) { return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }
    function updateZoomLabel() { $('#zoomLabel').text(Math.round(zoom * 100) + '%'); }

    function setWorldView(z) {
        zoom = clampZoom(z);
        $('#world').css('transform', 'scale(' + zoom + ')');
        $('#worldSize').css({ width: WORLD_W * zoom, height: WORLD_H * zoom });
        updateZoomLabel();
        hideQuickMenu();
        if (window._minimap) window._minimap.draw();
    }

    function getClampMode() { return $('#clampMode').val() || 'soft'; }
    function isSnapEnabled() { return $('#snapToggle').is(':checked'); }
    function isGridMoveOn() { return $('#gridToggle').is(':checked'); }

    function sign(v) { return v < 0 ? -1 : 1; }
    /* 부호는 유지하고, 절대값만 [min,max]로 클램프 */
    function clampSigned(v, min, max) {
        var s = sign(v), a = Math.abs(v);
        if (a < min) a = min;
        if (a > max) a = max;
        return s * a;
    }

    /* scaleX/scaleY/rotation을 한 번에 적용 */
    function applyTransform($item) {
        var sx = $item.data('scaleX') || 1;
        var sy = $item.data('scaleY') || 1;
        var rot = $item.data('rotation') || 0; // deg
        $item.css('transform', 'rotate(' + rot + 'deg) scale(' + sx + ',' + sy + ')');
    }


    // 메뉴 아이콘 초기화 (jQuery 사용)
    function initMenuIcons(count) {
        try {
            var $grid = $('#menuGrid');
            if ($grid.length === 0) return;

            // var count = 10; // 아이콘 개수
            for (var i = 1; i <= count; i++) {
                var idx = ('0' + i).slice(-2); // 01, 02 ...
                var $img = $('<img>', {
                    src: 'images/menu' + idx + '.svg',
                    alt: '메뉴 ' + i,
                    tabindex: 0
                });
                $grid.append($img);
            }
        } catch (e) {
            console.error('menuGrid 초기화 오류', e);
        }
    }

    /** 우측 상단 레이어 UI 초기화 (jQuery) */
    function initLayerUI(layers) {
        try {
            var $select = $('#layerSelect');
            var $title = $('#layerTitle');
            var $desc = $('#layerDesc');

            if ($select.length === 0 || $title.length === 0 || $desc.length === 0) {
                console.warn('initLayerUI: 필수 엘리먼트가 없습니다.');
                return;
            }

            // 기존 placeholder 유지 + 레이어 옵션 추가
            for (var i = 0; i < layers.length; i++) {
                var item = layers[i];
                var $opt = $('<option>', {
                    value: item.id,
                    text: item.name
                }).attr('data-desc', item.desc);
                $select.append($opt);
            }

            // 선택 시 좌측 정보 갱신
            $select.on('change', function () {
                updateLayerInfo($select, $title, $desc);
            });

            // + 버튼(미구현): 추후 팝업 연결 예정
            $('#addLayerBtn').on('click', function () {
                // TODO: 요청 시 레이어 추가 팝업 구현
            });
        } catch (e) {
            console.error('initLayerUI 오류', e);
        }
    }

    /** 셀렉트에서 선택된 옵션으로 타이틀/설명 표시 (jQuery) */
    function updateLayerInfo($select, $titleEl, $descEl) {
        var val = $select.val();
        if (!val) {
            $titleEl.text('선택된 레이어 없음');
            $descEl.text('우측 상단에서 레이어를 선택하세요.');
            return;
        }
        var $opt = $select.find('option:selected');
        $titleEl.text($opt.text());
        $descEl.text($opt.data('desc') || '');
    }

    function getDefaultLayers() {
        return [
            { id: 'L001', name: '기본 레이어', desc: '프로그램 기본 레이어' },
            { id: 'L002', name: '자산 현황', desc: '자산 목록/상태 표시' },
            { id: 'L003', name: '점검 레이어', desc: '점검 체크 및 리포트' }
        ];
    }

    /** 상단 이동 옵션 컨트롤에 상단 상수의 기본값 적용 */
    function initMoveOptionDefaults() {
        $('#clampMode').val(CLAMP_DEFAULT);
        $('#snapToggle').prop('checked', SNAP_DEFAULT);
        $('#gridToggle').prop('checked', GRID_MOVE_DEFAULT);
    }

    /** 좌측 SVG 아이콘을 드래그 가능하게 준비 */
    function bindMenuIconDrag() {
        var $imgs = $('.menu-grid img');
        $imgs.attr('draggable', true);
        $imgs.on('dragstart', function (e) {
            var src = this.getAttribute('src');
            // 드롭 시 참조할 데이터 저장
            e.originalEvent.dataTransfer.setData('text/plain', src);
            // 미리보기 이미지(옵션)
            e.originalEvent.dataTransfer.effectAllowed = 'copy';
        });
    }

    /** 드롭 대상 캔버스 바인딩 */
    function bindCanvasDnd() {
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        $canvas.on('dragover', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        $canvas.on('drop', function (e) {
            e.preventDefault();
            var payload = e.originalEvent.dataTransfer.getData('text/plain');
            if (!payload) return;

            var target = e.currentTarget;
            var rect = target.getBoundingClientRect();
            var $t = $(target);
            var z = getZoom();

            var cx = e.originalEvent.clientX - rect.left;
            var cy = e.originalEvent.clientY - rect.top;
            var x = (cx + $t.scrollLeft()) / z;
            var y = (cy + $t.scrollTop()) / z;

            if (payload.startsWith('shape:')) {
                var shape = payload.slice(6);
                if (shape === 'text') {
                    var t = prompt('텍스트 입력', '');
                    if (t == null || t.trim() === '') return; // 입력 취소/공백이면 생성 안 함
                    addShapeToCanvas('text', x, y, { text: t.trim() });
                } else {
                    addShapeToCanvas(shape, x, y);
                }
            } else {
                addIconToCanvas(payload, x, y);
            }
        });
    }

    /** SVG 파일을 inline <svg> 로드 (DOMParser로 SVG 네임스페이스 유지) */
    function loadInlineSvg(url) {
        return $.get(url, null, null, 'text').then(function (data) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(data, 'image/svg+xml');

            // 최상위 <svg> 선택
            var svg = (doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'svg')
                ? doc.documentElement
                : doc.querySelector('svg');

            if (!svg) throw new Error('SVG 파싱 실패: ' + url);

            // 현재 문서로 가져오기(네임스페이스/메서드 보존)
            var adopted = document.importNode(svg, true);
            return $(adopted);
        });
    }


    /**
 * SVG 콘텐츠를 표준 뷰포트(ICON_SIZE) 안에 ICON_PAD 여백을 두고
 * 중앙 정렬/등비 스케일로 맞춘다.
 * - 기존 내부 여백(viewBox 차이)로 인한 크기 들쭉날쭉을 해소
 */
    function normalizeSvg($svg) {
        try {
            // 1) 표준 뷰포트/패딩
            $svg
                .attr({
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                    viewBox: '0 0 ' + ICON_SIZE + ' ' + ICON_SIZE,
                    preserveAspectRatio: 'xMidYMid meet'
                })
                .css('overflow', 'visible');

            // 2) 같은 문서의 SVG 네임스페이스로 래퍼 생성
            var svgEl = $svg[0];
            var doc = svgEl.ownerDocument;
            var wrap = $svg.find('g.icon-root').get(0);
            if (!wrap) {
                wrap = doc.createElementNS(SVG_NS, 'g');
                wrap.setAttribute('class', 'icon-root');

                // defs/title/metadata/desc 제외하고 요소 자식만 이동 (텍스트/주석 제외)
                var node = svgEl.firstChild;
                var toMove = [];
                while (node) {
                    var next = node.nextSibling;
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        var tag = (node.tagName || '').toLowerCase();
                        if (tag !== 'defs' && tag !== 'title' && tag !== 'metadata' && tag !== 'desc') {
                            toMove.push(node);
                        }
                    }
                    node = next;
                }
                for (var i = 0; i < toMove.length; i++) {
                    wrap.appendChild(toMove[i]); // 같은 문서/NS → OK
                }
                svgEl.appendChild(wrap);
            }

            // 3) bbox 계산 (필요시 폴백)
            var bbox;
            try {
                bbox = wrap.getBBox();
            } catch (err) {
                var shapes = $svg.find('path,rect,circle,ellipse,line,polyline,polygon,g,use').get();
                var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (var j = 0; j < shapes.length; j++) {
                    var el = shapes[j];
                    if (typeof el.getBBox !== 'function') continue;
                    var b = el.getBBox();
                    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height)) continue;
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                }
                if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
                    bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                } else {
                    bbox = { x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE };
                }
            }

            // 4) ICON_PAD 여백으로 등비 스케일 + 중앙 정렬
            var inner = ICON_SIZE - ICON_PAD * 2;
            var bw = bbox.width || 1;
            var bh = bbox.height || 1;
            var s = Math.min(inner / bw, inner / bh);
            var tx = (ICON_SIZE - bw * s) / 2 - bbox.x * s;
            var ty = (ICON_SIZE - bh * s) / 2 - bbox.y * s;

            wrap.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + s + ')');
        } catch (e) {
            console.warn('normalizeSvg 실패(무시 가능):', e);
        }
    }


    /** 캔버스에 아이콘 추가 */
    function addIconToCanvas(src, x, y) {
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        loadInlineSvg(src).then(function ($svg) {
            // 아이템 컨테이너 생성
            var id = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            var $item = $('<div>', { class: 'canvas-item', 'data-id': id });

            // 초기 크기(64x64) 설정
            $svg.attr({ width: 64, height: 64 });

            // 캔버스에 추가
            $item.append($svg);
            // $canvas.append($item);
            $('#world').append($item);
            $item.data('scaleX', 1);
            $item.data('scaleY', 1);

            normalizeSvg($svg); // ← 아이콘을 64×64 + 여백으로 표준화

            // 위치(아이콘 중앙이 드롭지점에 오도록 -32 보정)
            $item.css({ left: (x - 32) + 'px', top: (y - 32) + 'px' });
            // 기존 선택 해제
            $('.canvas-item.is-selected').removeClass('is-selected')
                .each(function () { removeSelectionOverlay($(this)); });

            // 방금 추가한 아이템에 즉시 사각 테두리 표시
            $item.addClass('is-selected');
            applySelectionOverlay($item);

            // [minimap] 아이템 추가 후 미니맵 갱신
            if (window._minimap) window._minimap.draw();
            /*
            // 클릭 시 선택 처리
            $item.on('mousedown', function (e) {
                // 다른 선택 해제
                $('.canvas-item.is-selected').removeClass('is-selected')
                    .each(function () { removeSelectionOverlay($(this)); });

                $(this).addClass('is-selected');
                applySelectionOverlay($(this));
                e.stopPropagation();
            });

            // 캔버스 빈 곳 클릭 시 선택 해제
            $('#canvas').off('mousedown.canvasClear').on('mousedown.canvasClear', function () {
                $('.canvas-item.is-selected').removeClass('is-selected')
                    .each(function () { removeSelectionOverlay($(this)); });
            });
            */
        }).catch(function (err) {
            console.error(err);
        });
    }

    /** 공통: 선택 해제 */
    function clearSelection() {
        $('.canvas-item.is-selected').removeClass('is-selected')
            .each(function () { removeSelectionOverlay($(this)); });
    }

    /** 전역 위임: 아이콘 드래그 이동 */
    function bindCanvasItemMove() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var dragging = false;
        var $dragItem = null;
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;

        // 빈 공간 클릭 시 선택 해제
        $canvas.off('mousedown.canvasClear').on('mousedown.canvasClear', function (e) {
            // 연결 아이템의 빈 영역(스트로크 이외)을 클릭했다면 '빈 곳'으로 취급
            if ($(e.target).closest('.connection-item').length &&
                !$(e.target).closest('.connection-polyline').length) {
                hideQuickMenu();
                clearSelection();
                return;
            }
            if (e.which === 2) return; // 중클릭은 패닝
            if ($('#canvas').hasClass('canvas-pan-ready') || $('#canvas').hasClass('canvas-is-panning')) return;
            if ($(e.target).closest('.canvas-item, #quickMenu').length) return; // 아이템이면 여기서 처리 안 함
            hideQuickMenu();
            clearSelection(); // 빈 공간 클릭 시 퀵메뉴 닫기
        });

        // 아이템 클릭(왼쪽 버튼) → 선택 + 드래그 시작
        $canvas.on('mousedown', '.canvas-item', function (e) {
            if (e.which === 2) return;
            if ($('#canvas').hasClass('canvas-pan-ready') || $('#canvas').hasClass('canvas-is-panning')) return;
            if (e.which !== 1) return;
            if ($(e.target).closest('.selection-handle, .edge-handle, .corner-hit, .selection-rotate-handle').length) return;

            // ⛔ 연결 모드일 땐 드래그 시작 금지(꼭짓점 추가가 우선)
            if (connect && connect.active) { return; }

            // ⛔ 프리뷰 아이템은 무시
            var $self = $(this);
            if ($self.hasClass('preview')) { e.preventDefault(); e.stopPropagation(); return; }

            // ⛔ 연결 아이템은 '선택만' 하고 드래그 이동 금지
            if ($self.attr('data-type') === 'connection') {
                if (!$(e.target).closest('.connection-polyline').length) {
                    // 선이 아닌 빈 영역 → 아이템 취급하지 않음
                    return;
                }
                if (!$self.hasClass('is-selected')) {
                    clearSelection();
                    $self.addClass('is-selected');
                    applySelectionOverlay($self);
                }
                e.preventDefault(); e.stopPropagation();
                return;
            }

            // ===== 여기서부터 일반 아이템 드래그 시작 =====
            $dragItem = $self;

            if (!$dragItem.hasClass('is-selected')) {
                clearSelection();
                $dragItem.addClass('is-selected');
                applySelectionOverlay($dragItem);
            }

            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseFloat($dragItem.css('left')) || 0;
            startTop = parseFloat($dragItem.css('top')) || 0;
            $dragItem.data('_startL', startLeft).data('_startT', startTop);
            $dragItem.addClass('is-dragging');

            $('body').addClass('no-select');
            e.preventDefault();
        });

        // 이동
        $doc.on('mousemove.canvasDrag', function (e) {
            if (!dragging || !$dragItem) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var z = getZoom();
            var newLeft = startLeft + dx / z;
            var newTop = startTop + dy / z;

            // 하드 클램프: 이동 중 즉시 경계 제한
            if (getClampMode() === 'hard') {
                var sx = Math.abs($dragItem.data('scaleX') || 1);
                var sy = Math.abs($dragItem.data('scaleY') || 1);
                var itemW = ICON_SIZE * sx;
                var itemH = ICON_SIZE * sy;
                var maxL = WORLD_W - itemW;   // ← $canvas.width() 대신 WORLD_W
                var maxT = WORLD_H - itemH;   // ← $canvas.height() 대신 WORLD_H
                newLeft = Math.max(0, Math.min(newLeft, maxL));
                newTop = Math.max(0, Math.min(newTop, maxT));
            }

            // 그리드 이동(우선 적용) 또는 스냅(보조)
            if (isGridMoveOn()) {
                newLeft = Math.round(newLeft / GRID_SIZE) * GRID_SIZE;
                newTop = Math.round(newTop / GRID_SIZE) * GRID_SIZE;
            } else if (isSnapEnabled()) {
                var snapL = Math.round(newLeft / GRID_SIZE) * GRID_SIZE;
                var snapT = Math.round(newTop / GRID_SIZE) * GRID_SIZE;
                if (Math.abs(snapL - newLeft) <= SNAP_THRESHOLD) newLeft = snapL;
                if (Math.abs(snapT - newTop) <= SNAP_THRESHOLD) newTop = snapT;
            }
            // 필요시 경계 클램프 로직 추가 가능(현재는 자유 이동)
            $dragItem.css({ left: newLeft + 'px', top: newTop + 'px' });
            // 이 아이템에 붙은 연결선 끝점도 갱신
            if ($dragItem && $dragItem.attr('data-type') !== 'connection') {
                updateAttachedConnectionsForItem($dragItem);
            }
        });

        // 종료
        $doc.on('mouseup.canvasDrag', function () {
            if (!dragging) return;

            // 소프트 클램프: 드롭 후 안쪽으로 스냅백 애니메이션
            if ($dragItem && getClampMode() === 'soft') {
                var sx = Math.abs($dragItem.data('scaleX') || 1);
                var sy = Math.abs($dragItem.data('scaleY') || 1);
                var itemW = ICON_SIZE * sx;
                var itemH = ICON_SIZE * sy;
                var maxL = WORLD_W - itemW;
                var maxT = WORLD_H - itemH;

                var curL = parseFloat($dragItem.css('left')) || 0;
                var curT = parseFloat($dragItem.css('top')) || 0;

                var targetL = Math.max(0, Math.min(curL, maxL));
                var targetT = Math.max(0, Math.min(curT, maxT));

                // 그리드 이동이 켜져 있으면 최종 위치도 그리드에 스냅
                if (isGridMoveOn()) {
                    targetL = Math.round(targetL / GRID_SIZE) * GRID_SIZE;
                    targetT = Math.round(targetT / GRID_SIZE) * GRID_SIZE;
                } else if (isSnapEnabled()) {
                    var sL = Math.round(targetL / GRID_SIZE) * GRID_SIZE;
                    var sT = Math.round(targetT / GRID_SIZE) * GRID_SIZE;
                    if (Math.abs(sL - targetL) <= SNAP_THRESHOLD) targetL = sL;
                    if (Math.abs(sT - targetT) <= SNAP_THRESHOLD) targetT = sT;
                }

                $dragItem.stop(true).animate({ left: targetL, top: targetT }, 120)
                    .promise()
                    .done(function () {
                        if (window._minimap) window._minimap.draw();
                    });
            } else {
                // [minimap] 즉시 갱신
                if (window._minimap) window._minimap.draw();
            }

            if ($dragItem) {
                var sL = $dragItem.data('_startL') || 0;
                var sT = $dragItem.data('_startT') || 0;
                var cL = parseFloat($dragItem.css('left')) || 0;
                var cT = parseFloat($dragItem.css('top')) || 0;
                var moved = Math.abs(cL - sL) + Math.abs(cT - sT);
                if (moved > 2) {
                    $dragItem.data('justDragged', true);
                    setTimeout(function () { $dragItem && $dragItem.removeData('justDragged'); }, 0); // 같은 제스처에서만 억제
                }
            }
            dragging = false;
            if ($dragItem) { $dragItem.removeClass('is-dragging'); }
            $('body').removeClass('no-select');
            $dragItem = null;

            hideQuickMenu();
        });

        // 네이티브 드래그 이미지 방지
        $canvas.on('dragstart', '.canvas-item, .canvas-item *', function (e) {
            e.preventDefault();
        });
    }

    /** 리사이즈 핸들 드래그로 크기 조정 (중앙 기준 균등 스케일) */
    function bindResizeHandles() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var resizing = false;
        var $item = null;
        var mode = 'uniform';     // 'uniform' | 'x' | 'y'
        var startScaleX = 1, startScaleY = 1;
        var centerX = 0, centerY = 0;
        var r0 = 1, ax0 = 1, ay0 = 1;     // 기준 반경/축거리
        var sgnX0 = 1, sgnY0 = 1;         // 기준 부호(반전 판정)

        // 코너/중점 핸들 + 엣지에서 리사이즈 시작
        $canvas.on('mousedown', '.selection-handle, .edge-handle, .corner-hit', function (e) {
            hideQuickMenu();

            if (connect && connect.active) { e.preventDefault(); e.stopPropagation(); return; }

            if (e.which === 2) return; // ← 중클릭은 패닝으로 넘김
            if ($('#canvas').hasClass('canvas-pan-ready') || $('#canvas').hasClass('canvas-is-panning')) return; // ← 추가(중요: stopPropagation 전에)
            if (e.which !== 1) return;
            e.stopPropagation();
            e.preventDefault();

            $item = $(this).closest('.canvas-item');
            if ($item.length === 0) return;

            // 선택 보장
            if (!$item.hasClass('is-selected')) {
                clearSelection();
                $item.addClass('is-selected');
                applySelectionOverlay($item);
            }

            // 핸들 종류에 따라 모드 결정
            var h = $(this).attr('data-handle') || '';
            if (h === 'n' || h === 's') mode = 'y';
            else if (h === 'w' || h === 'e') mode = 'x';
            else mode = 'uniform'; // nw/ne/sw/se

            // 시작 배율
            startScaleX = $item.data('scaleX') || 1;
            startScaleY = $item.data('scaleY') || 1;

            // 중심 좌표(페이지)
            var off = $item.offset();
            var w = ICON_SIZE * Math.abs(startScaleX);
            var hgt = ICON_SIZE * Math.abs(startScaleY);
            centerX = off.left + w / 2;
            centerY = off.top + hgt / 2;

            var dx0 = e.clientX - centerX;
            var dy0 = e.clientY - centerY;

            // 기준값/부호 (반전 판정용)
            r0 = Math.max(10, Math.hypot(dx0, dy0));
            ax0 = Math.max(10, Math.abs(dx0));
            ay0 = Math.max(10, Math.abs(dy0));
            sgnX0 = sign(dx0);
            sgnY0 = sign(dy0);

            resizing = true;
            $('body').addClass('no-select');
        });

        // 드래그 중
        $doc.on('mousemove.resize', function (e) {
            if (!resizing || !$item) return;

            var dx = e.clientX - centerX;
            var dy = e.clientY - centerY;

            var sx = startScaleX;
            var sy = startScaleY;

            if (mode === 'uniform') {
                var r1 = Math.max(10, Math.hypot(dx, dy));
                var ratio = r1 / r0;
                var flipX = (dx === 0) ? 1 : (sign(dx) === sgnX0 ? 1 : -1);
                var flipY = (dy === 0) ? 1 : (sign(dy) === sgnY0 ? 1 : -1);
                sx = clampSigned(startScaleX * ratio * flipX, SCALE_MIN, SCALE_MAX);
                sy = clampSigned(startScaleY * ratio * flipY, SCALE_MIN, SCALE_MAX);
            } else if (mode === 'x') {
                var ax1 = Math.max(10, Math.abs(dx));
                var rx = ax1 / ax0;
                var flipX = (dx === 0) ? 1 : (sign(dx) === sgnX0 ? 1 : -1);
                sx = clampSigned(startScaleX * rx * flipX, SCALE_MIN, SCALE_MAX);
                sy = startScaleY;
            } else if (mode === 'y') {
                var ay1 = Math.max(10, Math.abs(dy));
                var ry = ay1 / ay0;
                var flipY = (dy === 0) ? 1 : (sign(dy) === sgnY0 ? 1 : -1);
                sy = clampSigned(startScaleY * ry * flipY, SCALE_MIN, SCALE_MAX);
                sx = startScaleX;
            }

            /*
            // 적용
            $item.css('transform', 'scale(' + sx + ',' + sy + ')');
            $item.data('scaleX', sx);
            $item.data('scaleY', sy);
            */
            $item.data('scaleX', sx);
            $item.data('scaleY', sy);
            applyTransform($item);
        });

        // 리사이즈 종료
        $doc.on('mouseup.resize', function () {
            if (!resizing) return;
            resizing = false;
            $('body').removeClass('no-select');
            $item = null;

            // [minimap] 리사이즈 종료 후 갱신
            if (window._minimap) window._minimap.draw();
        });
    }

    /* 회전 핸들 드래그로 회전 */
    function bindRotateHandle() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var rotating = false;
        var $item = null;
        var startRot = 0;
        var centerX = 0, centerY = 0;
        var startAng = 0;

        // 시작
        $canvas.on('mousedown', '.selection-rotate-handle', function (e) {
            hideQuickMenu();

            if (connect && connect.active) { e.preventDefault(); e.stopPropagation(); return; }

            if (e.which === 2) return; // ← 중클릭은 패닝으로 넘김
            if ($('#canvas').hasClass('canvas-pan-ready') || $('#canvas').hasClass('canvas-is-panning')) return; // ← 추가
            if (e.which !== 1) return;
            e.stopPropagation();
            e.preventDefault();

            $item = $(this).closest('.canvas-item');
            if ($item.length === 0) return;

            // 선택 보장
            if (!$item.hasClass('is-selected')) {
                clearSelection();
                $item.addClass('is-selected');
                applySelectionOverlay($item);
            }

            // 중심 좌표(페이지)
            var off = $item.offset();
            var sx = Math.abs($item.data('scaleX') || 1);
            var sy = Math.abs($item.data('scaleY') || 1);
            var w = ICON_SIZE * sx;
            var h = ICON_SIZE * sy;
            centerX = off.left + w / 2;
            centerY = off.top + h / 2;

            startRot = $item.data('rotation') || 0;
            startAng = Math.atan2(e.clientY - centerY, e.clientX - centerX);

            rotating = true;
            $item.addClass('is-rotating');
            $('body').addClass('no-select');
        });

        // 진행
        $doc.on('mousemove.rotate', function (e) {
            if (!rotating || !$item) return;

            var ang = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            var deltaDeg = (ang - startAng) * 180 / Math.PI;
            var newRot = startRot + deltaDeg;

            // Shift: 15도 스냅
            if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;

            $item.data('rotation', newRot);
            applyTransform($item);
        });

        // 종료
        $doc.on('mouseup.rotate', function () {
            if (!rotating) return;
            rotating = false;
            if ($item) $item.removeClass('is-rotating');
            $('body').removeClass('no-select');
            $item = null;

            // [minimap] 회전 종료 후 갱신
            if (window._minimap) window._minimap.draw();
        });
    }


    /** 선택된 아이템에 '아이콘 모양 그대로' 윤곽선 + 핸들 생성 */
    /** 선택된 아이템에 '사각 테두리 + 핸들' 생성 (아이콘 활성화 효과 없음) */
    /** 선택된 아이템에 '표준 뷰포트 기준 사각 테두리 + 핸들' 생성 */
    function applySelectionOverlay($item) {
        if ($item.attr('data-type') === 'connection') {
            applyConnectionOverlay($item);
            return;
        }

        var $svg = $item.find('svg').first();
        if ($svg.length === 0) return;

        removeSelectionOverlay($item); // 중복 제거

        var svgEl = $svg.get(0);
        var svgns = 'http://www.w3.org/2000/svg';

        // 표준 좌표(0..ICON_SIZE)를 기준으로 사각형/핸들 생성
        var pad = ICON_PAD;
        var x = pad, y = pad;
        var w = ICON_SIZE - pad * 2;
        var h = ICON_SIZE - pad * 2;

        var overlay = document.createElementNS(svgns, 'g');
        overlay.setAttribute('class', 'selection-overlay');

        var rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('class', 'selection-rect');
        overlay.appendChild(rect);

        var EH = 12; // edge hit thickness
        var edges = [
            { x: x, y: y, w: w, h: EH, tag: 'n' }, // 상
            { x: x + w - EH, y: y, w: EH, h: h, tag: 'e' }, // 우
            { x: x, y: y + h - EH, w: w, h: EH, tag: 's' }, // 하
            { x: x, y: y, w: EH, h: h, tag: 'w' }  // 좌
        ];
        for (var ei = 0; ei < edges.length; ei++) {
            var eh = document.createElementNS(svgns, 'rect');
            eh.setAttribute('x', edges[ei].x);
            eh.setAttribute('y', edges[ei].y);
            eh.setAttribute('width', edges[ei].w);
            eh.setAttribute('height', edges[ei].h);
            eh.setAttribute('class', 'edge-handle');
            eh.setAttribute('data-handle', edges[ei].tag);
            overlay.appendChild(eh);
        }

        // 회전 핸들(상단 중앙에서 위로 살짝 떨어진 곳)
        var RH_R = 7;    // 회전 핸들 반지름
        var RH_GAP = 18; // 상단 테두리에서 위로 띄울 거리
        var cx = x + w / 2;
        var cy = y - RH_GAP;

        // 연결선
        var rLine = document.createElementNS(svgns, 'line');
        rLine.setAttribute('x1', cx);
        rLine.setAttribute('y1', y);
        rLine.setAttribute('x2', cx);
        rLine.setAttribute('y2', cy);
        rLine.setAttribute('class', 'selection-rotate-line');
        overlay.appendChild(rLine);

        // 원형 핸들
        var rHandle = document.createElementNS(svgns, 'circle');
        rHandle.setAttribute('cx', cx);
        rHandle.setAttribute('cy', cy);
        rHandle.setAttribute('r', RH_R);
        rHandle.setAttribute('class', 'selection-rotate-handle');
        rHandle.setAttribute('data-handle', 'rotate');
        overlay.appendChild(rHandle);

        var CH = 18; // corner hit size (px, SVG 좌표계)
        var corners = [
            { cx: x, cy: y, tag: 'nw' },
            { cx: x + w, cy: y, tag: 'ne' },
            { cx: x, cy: y + h, tag: 'sw' },
            { cx: x + w, cy: y + h, tag: 'se' }
        ];
        for (var ci = 0; ci < corners.length; ci++) {
            var ch = document.createElementNS(svgns, 'rect');
            ch.setAttribute('x', corners[ci].cx - CH / 2);
            ch.setAttribute('y', corners[ci].cy - CH / 2);
            ch.setAttribute('width', CH);
            ch.setAttribute('height', CH);
            ch.setAttribute('class', 'corner-hit');
            ch.setAttribute('data-handle', corners[ci].tag);
            overlay.appendChild(ch);
        }

        // 8개 핸들(모양만, 동작 미구현 → 이번 단계에서 드래그로 크기조정)
        var pts = [
            [x, y], [x + w / 2, y], [x + w, y],
            [x, y + h / 2], [x + w, y + h / 2],
            [x, y + h], [x + w / 2, y + h], [x + w, y + h]
        ];
        var tags = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

        for (var i = 0; i < pts.length; i++) {
            var r = document.createElementNS(svgns, 'rect');
            var size = 8;
            r.setAttribute('x', pts[i][0] - size / 2);
            r.setAttribute('y', pts[i][1] - size / 2);
            r.setAttribute('width', size);
            r.setAttribute('height', size);
            r.setAttribute('class', 'selection-handle');
            r.setAttribute('data-handle', tags[i]); // ← 커서/동작용 태그
            overlay.appendChild(r);
        }
        /*
        // 8개 핸들(모양만, 동작 미구현)
        var pts = [
            [x, y], [x + w / 2, y], [x + w, y],
            [x, y + h / 2], [x + w, y + h / 2],
            [x, y + h], [x + w / 2, y + h], [x + w, y + h]
        ];
        for (var i = 0; i < pts.length; i++) {
            var r = document.createElementNS(svgns, 'rect');
            var size = 8;
            r.setAttribute('x', pts[i][0] - size / 2);
            r.setAttribute('y', pts[i][1] - size / 2);
            r.setAttribute('width', size);
            r.setAttribute('height', size);
            r.setAttribute('class', 'selection-handle');
            overlay.appendChild(r);
        }
        */
        svgEl.appendChild(overlay);
    }

    function applyConnectionOverlay($item) {
        var $svg = $item.find('svg').first();
        if (!$svg.length) return;
        removeSelectionOverlay($item);

        var data = $item.data('conn'); if (!data) return;
        var overlay = document.createElementNS(SVG_NS, 'g');
        overlay.setAttribute('class', 'selection-overlay conn-overlay');

        var pts = data.points;
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            var r = document.createElementNS(SVG_NS, 'rect');
            var size = 8;
            r.setAttribute('x', p.x - size / 2);
            r.setAttribute('y', p.y - size / 2);
            r.setAttribute('width', size);
            r.setAttribute('height', size);
            r.setAttribute('class', 'conn-handle');
            r.setAttribute('data-idx', i);
            if (i === 0) r.setAttribute('data-end', 'start');
            else if (i === pts.length - 1) r.setAttribute('data-end', 'end');
            overlay.appendChild(r);
        }
        $svg[0].appendChild(overlay);
    }

    function bindConnectionHandleDrag() {
        var $doc = $(document);
        var dragging = false, $conn = null, idx = -1;

        $('#canvas').on('mousedown', '.conn-handle', function (e) {
            if (e.which !== 1) return;
            e.stopPropagation(); e.preventDefault();

            $conn = $(this).closest('.connection-item');
            if (!$conn.length) return;

            // 선택 보장
            if (!$conn.hasClass('is-selected')) { clearSelection(); $conn.addClass('is-selected'); applySelectionOverlay($conn); }

            dragging = true; idx = parseInt(this.getAttribute('data-idx'), 10);
            $('body').addClass('no-select');
        });

        $doc.on('mousemove.connHandle', function (e) {
            if (!dragging || !$conn) return;
            var data = $conn.data('conn'); if (!data) return;
            var p = clientToWorld(e.clientX, e.clientY);
            data.points[idx] = p;
            data.poly.setAttribute('points', data.points.map(pt => pt.x + ',' + pt.y).join(' '));
            applyConnectionOverlay($conn);
        });

        $doc.on('mouseup.connHandle', function (e) {
            if (!dragging || !$conn) return;
            var data = $conn.data('conn'); if (data) {
                var endTag = (idx === 0) ? 'start' : (idx === data.points.length - 1 ? 'end' : null);
                if (endTag) {
                    // 드롭 위치에 아이템이 있으면 그걸로 연결, 없으면 분리
                    var el = document.elementFromPoint(e.clientX, e.clientY);
                    var $hit = $(el).closest('.canvas-item');
                    var connId = $conn.data('id');

                    if ($hit.length && $hit.attr('data-type') !== 'connection') {
                        var newId = $hit.data('id');
                        var c = getItemCenter($hit);
                        data.points[idx] = c;
                        if (endTag === 'start') {
                            if (data.attachStart && data.attachStart.type === 'item')
                                unregisterConnectionFromItem(data.attachStart.id, connId, 'start');
                            data.attachStart = { type: 'item', id: newId };
                            registerConnectionToItem(newId, connId, 'start');
                        } else {
                            if (data.attachEnd && data.attachEnd.type === 'item')
                                unregisterConnectionFromItem(data.attachEnd.id, connId, 'end');
                            data.attachEnd = { type: 'item', id: newId };
                            registerConnectionToItem(newId, connId, 'end');
                        }
                    } else {
                        if (endTag === 'start' && data.attachStart) { unregisterConnectionFromItem(data.attachStart.id, connId, 'start'); data.attachStart = null; }
                        if (endTag === 'end' && data.attachEnd) { unregisterConnectionFromItem(data.attachEnd.id, connId, 'end'); data.attachEnd = null; }
                    }
                }
                data.poly.setAttribute('points', data.points.map(pt => pt.x + ',' + pt.y).join(' '));
                applyConnectionOverlay($conn);
                if (window._minimap) window._minimap.draw();
            }
            dragging = false; $conn = null; idx = -1; $('body').removeClass('no-select');
        });
    }


    function bindCanvasPan() {
        var $win = $(window);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var spaceDown = false;
        var panning = false;
        var startX = 0, startY = 0;
        var startSL = 0, startST = 0;
        var $panTarget = null;

        function isSpaceKey(e) {
            return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.which === 32 || e.keyCode === 32;
        }

        // 스페이스 다운: 항상 preventDefault (자동반복 포함)
        $win.on('keydown.canvasPan', function (e) {
            if (!isSpaceKey(e)) return;

            if (!spaceDown) {
                spaceDown = true;
                $canvas.addClass('canvas-pan-ready');
                // 드래그 시작 전에도 선택 방지 (레이아웃 전체)
                $('body').addClass('no-select');
            }
            // 자동반복으로 들어오는 keydown 모두에서 기본동작(스크롤) 차단
            e.preventDefault();
        });

        // 스페이스 업: 버튼 활성화/스크롤 기본동작도 차단
        $win.on('keyup.canvasPan', function (e) {
            if (!isSpaceKey(e)) return;

            spaceDown = false;
            $canvas.removeClass('canvas-pan-ready');

            // 패닝 중이 아니면 선택 차단 해제
            if (!panning) $('body').removeClass('no-select');

            // 스페이스가 포커스된 버튼/셀렉트를 클릭 처리하지 않도록
            e.preventDefault();
        });

        $win.on('blur.canvasPan', function () {
            spaceDown = false;
            $canvas.removeClass('canvas-pan-ready');
            if (!panning) $('body').removeClass('no-select');
        });

        // 중클릭 자동스크롤(브라우저 기본) 완전 차단
        $canvas.on('auxclick.canvasPan', function (e) {
            if (e.button === 1 || e.which === 2) e.preventDefault();
        }).on('click.canvasPan', function (e) {
            if (e.button === 1 || e.which === 2) e.preventDefault();
        });

        // 팬 시작: Space + 좌클릭 또는 중클릭
        $canvas.on('mousedown.canvasPan', function (e) {
            var isMiddle = (e.which === 2);
            if (!(spaceDown || isMiddle)) return;

            panning = true;
            $panTarget = $(e.currentTarget); // 실제 스크롤 대상
            startX = e.clientX;
            startY = e.clientY;
            startSL = $panTarget.scrollLeft();
            startST = $panTarget.scrollTop();

            // 포커스를 캔버스로 (스페이스 입력 안전)
            this.focus && this.focus();

            $canvas.addClass('canvas-is-panning');
            $('body').addClass('no-select');

            // 다른 mousedown 핸들러/선택 시작 막기
            e.preventDefault();
            e.stopPropagation();
        });

        // 이동
        $(document).on('mousemove.canvasPan', function (e) {
            if (!panning || !$panTarget) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            $panTarget.scrollLeft(startSL - dx);
            $panTarget.scrollTop(startST - dy);
        });

        // 종료
        $(document).on('mouseup.canvasPan', function () {
            if (!panning) return;
            panning = false;
            $panTarget = null;
            $canvas.removeClass('canvas-is-panning');
            // 스페이스가 여전히 눌려있지 않으면 선택차단 해제
            if (!spaceDown) $('body').removeClass('no-select');
        });
    }

    /** 선택 오버레이 제거 */
    function removeSelectionOverlay($item) {
        var $svg = $item.find('svg').first();
        if ($svg.length === 0) return;
        $svg.find('g.selection-overlay').remove();
    }

    function initMinimap() {
        var $mini = $('#miniCanvas');
        var $canvas = $('#canvas');
        if ($mini.length === 0) return;

        var MINI_W = $mini[0].width;   // 220
        var MINI_H = $mini[0].height;  // 160
        var ctx = $mini[0].getContext('2d');

        function getRatioAndOffset() {
            // 월드 크기 기준(현 버전: WORLD_W/H 사용)
            var r = Math.min(MINI_W / WORLD_W, MINI_H / WORLD_H);
            var offX = (MINI_W - WORLD_W * r) / 2;
            var offY = (MINI_H - WORLD_H * r) / 2;
            return { r, offX, offY };
        }

        function drawMinimap() {
            var { r, offX, offY } = getRatioAndOffset();
            ctx.clearRect(0, 0, MINI_W, MINI_H);

            // 1) 월드 테두리
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.strokeRect(offX, offY, WORLD_W * r, WORLD_H * r);

            // 2) 아이콘들(대략 bbox로 표시)
            $('#world .canvas-item').each(function () {
                var $it = $(this);
                var left = parseFloat($it.css('left')) || 0;
                var top = parseFloat($it.css('top')) || 0;
                var sx = Math.abs($it.data('scaleX') || 1);
                var sy = Math.abs($it.data('scaleY') || 1);
                var rot = ($it.data('rotation') || 0) * Math.PI / 180;

                var iw = ICON_SIZE * sx, ih = ICON_SIZE * sy;
                // 회전된 bbox 근사(작은 화면에서 충분히 OK)
                var bw = Math.abs(iw * Math.cos(rot)) + Math.abs(ih * Math.sin(rot));
                var bh = Math.abs(iw * Math.sin(rot)) + Math.abs(ih * Math.cos(rot));

                var x = offX + left * r;
                var y = offY + top * r;

                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(x, y, Math.max(2, bw * r), Math.max(2, bh * r));
            });

            // 3) 뷰포트 표시(메인 캔버스에서 보이는 영역)
            var z = getZoom();
            var vx = ($canvas.scrollLeft() / z) * r + offX;
            var vy = ($canvas.scrollTop() / z) * r + offY;
            var vw = ($canvas.innerWidth() / z) * r;
            var vh = ($canvas.innerHeight() / z) * r;

            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 2;
            ctx.strokeRect(vx, vy, vw, vh);
            ctx.fillStyle = 'rgba(14,165,233,0.12)';
            ctx.fillRect(vx, vy, vw, vh);
        }

        // 미니맵 클릭/드래그 → 메인 캔버스 패닝
        var draggingMini = false;
        function moveViewportByMini(e) {
            var rect = $mini[0].getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            var { r, offX, offY } = getRatioAndOffset();
            // 미니맵 좌표 → 월드 좌표
            var wx = (mx - offX) / r;
            var wy = (my - offY) / r;
            wx = Math.max(0, Math.min(WORLD_W, wx));
            wy = Math.max(0, Math.min(WORLD_H, wy));

            var z = getZoom();
            var targetSL = wx * z - $canvas.innerWidth() / 2;
            var targetST = wy * z - $canvas.innerHeight() / 2;

            $canvas.scrollLeft(targetSL);
            $canvas.scrollTop(targetST);
            drawMinimap();
        }

        $mini.on('mousedown', function (e) { draggingMini = true; moveViewportByMini(e); });
        $(document).on('mousemove', function (e) { if (draggingMini) moveViewportByMini(e); });
        $(document).on('mouseup', function () { draggingMini = false; });

        // 상태 변화에 반응(스크롤/윈도우리사이즈/아이콘 이동/줌 등)
        $canvas.on('scroll', drawMinimap);
        $(window).on('resize', drawMinimap);

        // 공개 핸들(다른 로직에서 부르면 즉시 갱신)
        window._minimap = { draw: drawMinimap };

        drawMinimap(); // 최초 1회
    }

    function bindMinimapToggle() {
        var $chk = $('#minimapToggle');
        if ($chk.length === 0) return;

        // 미니맵 컨테이너를 모두 포괄해서 찾음 (#miniWrap, #minimap, #minimapDock, .minimap)
        var $mini = $('#miniWrap, #minimap, #minimapDock, .minimap');

        // 컨테이너가 하나도 없으면 체크박스 비활성화 처리
        if ($mini.length === 0) {
            $chk.prop('disabled', true).closest('label').css('opacity', 0.5);
            return;
        }

        // 초기 상태 반영
        var initOn = $chk.is(':checked');
        $mini.toggle(initOn).attr('aria-hidden', !initOn);
        if (initOn && window._minimap && typeof window._minimap.draw === 'function') {
            window._minimap.draw();
        }

        // 변경 시 토글
        $chk.off('change.minimap').on('change.minimap', function () {
            var on = $(this).is(':checked');
            $mini.toggle(on).attr('aria-hidden', !on);
            if (on && window._minimap && typeof window._minimap.draw === 'function') {
                window._minimap.draw();
            }
        });
    }

    /* === 줌 유틸 === */
    function zoomAtPoint(newZ, clientX, clientY) {
        var $canvas = $('#canvas');
        var rect = $canvas[0].getBoundingClientRect();
        var cx = clientX - rect.left;
        var cy = clientY - rect.top;

        var sl = $canvas.scrollLeft();
        var st = $canvas.scrollTop();

        // 마우스 아래의 월드 좌표
        var worldX = (sl + cx) / zoom;
        var worldY = (st + cy) / zoom;

        setWorldView(newZ);

        // 같은 월드 좌표가 화면에서 그대로 보이도록 스크롤 보정
        $canvas.scrollLeft(worldX * zoom - cx);
        $canvas.scrollTop(worldY * zoom - cy);
    }

    function zoomAtCenter(newZ) {
        var $canvas = $('#canvas');
        var rect = $canvas[0].getBoundingClientRect();
        var cx = rect.width / 2;
        var cy = rect.height / 2;

        var sl = $canvas.scrollLeft();
        var st = $canvas.scrollTop();

        var worldX = (sl + cx) / zoom;
        var worldY = (st + cy) / zoom;

        setWorldView(newZ);

        $canvas.scrollLeft(worldX * zoom - cx);
        $canvas.scrollTop(worldY * zoom - cy);
    }

    function fitToView() {
        var $canvas = $('#canvas');
        var vw = $canvas.innerWidth();
        var vh = $canvas.innerHeight();
        var fitZ = clampZoom(Math.min(vw / WORLD_W, vh / WORLD_H));
        setWorldView(fitZ);
        $canvas.scrollLeft(0);
        $canvas.scrollTop(0);
    }

    /* === 줌 바인딩 === */
    function bindZoom() {
        var $canvas = $('#canvas');

        // 휠 줌: Ctrl/Command(⌘) 키가 눌린 경우만 확대/축소 (핀치줌도 ctrlKey=true로 들어옴)
        var el = $canvas[0];
        if (el) {
            el.addEventListener('wheel', function (e) {
                if (!e.ctrlKey && !e.metaKey) return;   // 일반 스크롤은 그대로 두기
                e.preventDefault(); // 반드시 passive:false 컨텍스트여야 함

                var factor = (e.deltaY < 0) ? 1.1 : (1 / 1.1);
                var target = clampZoom(zoom * factor);
                zoomAtPoint(target, e.clientX, e.clientY);
            }, { passive: false });
        }

        // 버튼
        $('#zoomInBtn').on('click', function () {
            zoomAtCenter(clampZoom(zoom * 1.1));
        });
        $('#zoomOutBtn').on('click', function () {
            zoomAtCenter(clampZoom(zoom / 1.1));
        });
        $('#zoomFitBtn').on('click', function () {
            fitToView();
        });

        // 키보드 단축키: Ctrl/Cmd + =/-, Ctrl/Cmd + 0
        $(window).on('keydown.zoom', function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                zoomAtCenter(clampZoom(zoom * 1.1));
            } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                zoomAtCenter(clampZoom(zoom / 1.1));
            } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                zoomAtCenter(1);
            }
        });
    }

    /* === 도형 그리기 === */
    function buildRegularPolygon(n, cx, cy, r, rotDeg) {
        var pts = [];
        var rot = (rotDeg || 0) * Math.PI / 180;
        for (var i = 0; i < n; i++) {
            var a = rot + (i * 2 * Math.PI / n);
            pts.push((cx + r * Math.cos(a)) + ',' + (cy + r * Math.sin(a)));
        }
        return pts.join(' ');
    }

    function buildStar(cx, cy, rOuter, rInner, rotDeg) {
        var pts = [];
        var rot = (rotDeg || -90) * Math.PI / 180; // 위쪽부터 시작
        for (var i = 0; i < 10; i++) {
            var r = (i % 2 === 0) ? rOuter : rInner;
            var a = rot + (i * Math.PI / 5);
            pts.push((cx + r * Math.cos(a)) + ',' + (cy + r * Math.sin(a)));
        }
        return pts.join(' ');
    }

    /* 표준 뷰포트(ICON_SIZE) 기준으로 svg+g.icon-root 생성 */
    function buildShapeSvg(shape) {
        var pad = ICON_PAD;
        var size = ICON_SIZE;
        var inner = size - pad * 2;
        var cx = size / 2, cy = size / 2;

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'icon-root');
        svg.appendChild(g);

        function style(el, strokeOnly) {
            var st = getCurrentStyle();
            el.setAttribute('vector-effect', 'non-scaling-stroke');

            if (el.tagName.toLowerCase() === 'text') {
                // 텍스트: fill=글자색
                el.setAttribute('fill', st.stroke);
                return el;
            }

            el.setAttribute('stroke', st.stroke);
            el.setAttribute('stroke-width', isFinite(st.width) ? st.width : 2);
            if (st.dash) el.setAttribute('stroke-dasharray', st.dash);
            if (!strokeOnly) el.setAttribute('fill', st.fill || 'none');
            else el.setAttribute('fill', 'none');
            return el;
        }

        switch (shape) {
            case 'line': {
                var ln = style(document.createElementNS(SVG_NS, 'line'), true);
                ln.setAttribute('x1', pad); ln.setAttribute('y1', size - pad);
                ln.setAttribute('x2', size - pad); ln.setAttribute('y2', pad);
                g.appendChild(ln);
                break;
            }
            case 'rect': {
                var r = style(document.createElementNS(SVG_NS, 'rect'));
                r.setAttribute('x', pad); r.setAttribute('y', pad);
                r.setAttribute('width', inner); r.setAttribute('height', inner);
                g.appendChild(r);
                break;
            }
            case 'ellipse': {
                var e = style(document.createElementNS(SVG_NS, 'ellipse'));
                e.setAttribute('cx', cx); e.setAttribute('cy', cy);
                e.setAttribute('rx', inner / 2); e.setAttribute('ry', inner / 2);
                g.appendChild(e);
                break;
            }
            case 'triangle': {
                var p = style(document.createElementNS(SVG_NS, 'polygon'));
                p.setAttribute('points', buildRegularPolygon(3, cx, cy + 2, inner * 0.48, -90));
                g.appendChild(p);
                break;
            }
            case 'diamond': {
                var p4 = style(document.createElementNS(SVG_NS, 'polygon'));
                p4.setAttribute('points', (cx) + ',' + (pad) + ' ' + (size - pad) + ',' + (cy) + ' ' + (cx) + ',' + (size - pad) + ' ' + (pad) + ',' + (cy));
                g.appendChild(p4);
                break;
            }
            case 'poly5': {
                var p5 = style(document.createElementNS(SVG_NS, 'polygon'));
                p5.setAttribute('points', buildRegularPolygon(5, cx, cy, inner * 0.45, -90));
                g.appendChild(p5);
                break;
            }
            case 'poly6': {
                var p6 = style(document.createElementNS(SVG_NS, 'polygon'));
                p6.setAttribute('points', buildRegularPolygon(6, cx, cy, inner * 0.46, 0));
                g.appendChild(p6);
                break;
            }
            case 'star': {
                var s = style(document.createElementNS(SVG_NS, 'polygon'));
                s.setAttribute('points', buildStar(cx, cy, inner * 0.48, inner * 0.23, -90));
                g.appendChild(s);
                break;
            }
            case 'arrow': {
                var path = style(document.createElementNS(SVG_NS, 'path'));
                path.setAttribute('d', `M ${pad} ${cy} H ${cx} M ${cx - 4} ${cy - 8} L ${size - pad} ${cy} L ${cx - 4} ${cy + 8} Z`);
                g.appendChild(path);
                break;
            }
            case 'polyline': {
                var pl = style(document.createElementNS(SVG_NS, 'polyline'));
                pl.setAttribute('points', `${pad},${size - pad} ${cx - 6},${pad + 10} ${cx + 4},${cy + 4} ${size - pad},${pad + 6}`);
                g.appendChild(pl);
                break;
            }
            case 'text': {
                var t = document.createElementNS(SVG_NS, 'text');
                t.setAttribute('x', cx);
                t.setAttribute('y', cy);
                t.setAttribute('dominant-baseline', 'middle');
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('font-size', '20'); // 초기 폰트 크기 (스케일로 같이 커짐)
                t.textContent = 'TEXT';
                // 색/스타일은 아래 style() 로직에서 일괄 적용
                g.appendChild(t);
                break;
            }
            default: {
                // fallback: rectangle
                var rr = style(document.createElementNS(SVG_NS, 'rect'));
                rr.setAttribute('x', pad); rr.setAttribute('y', pad);
                rr.setAttribute('width', inner); rr.setAttribute('height', inner);
                g.appendChild(rr);
            }
        }
        return $(svg);
    }

    function addShapeToCanvas(shape, x, y, opts) {
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var $svg = buildShapeSvg(shape);
        var id = 'shape_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        var $item = $('<div>', { class: 'canvas-item', 'data-id': id });

        $item.append($svg);
        $('#world').append($item);

        $item.data('scaleX', 1);
        $item.data('scaleY', 1);
        $item.data('rotation', 0);
        $item.attr('data-shape', shape);

        // 텍스트 초기 내용 반영
        if (shape === 'text' && opts && typeof opts.text === 'string') {
            var $t = $svg.find('g.icon-root > text').first();
            if ($t.length) $t.text(opts.text);
        }

        // 아이콘과 동일하게 중앙 정렬 배치(-32 보정)
        $item.css({ left: (x - 32) + 'px', top: (y - 32) + 'px' });

        // 선택 토글
        $('.canvas-item.is-selected').removeClass('is-selected')
            .each(function () { removeSelectionOverlay($(this)); });
        $item.addClass('is-selected');
        applySelectionOverlay($item);

        if (window._minimap) window._minimap.draw();
    }

    function bindDrawToolbar() {
        var $toolbar = $('#drawToolbar');
        var $canvas = $('#canvas');
        if ($toolbar.length === 0) return;

        // 드래그 → 드롭 직후 우발적 click 방지 플래그
        var toolbarDrag = { active: false, suppressClick: false };

        // 1) 드래그-드롭 지원
        $toolbar.on('dragstart', '.draw-tool', function (e) {
            var type = $(this).data('shape');
            e.originalEvent.dataTransfer.setData('text/plain', 'shape:' + type);
            e.originalEvent.dataTransfer.effectAllowed = 'copy';

            toolbarDrag.active = true;
            toolbarDrag.suppressClick = true; // 드롭 직후 클릭 무시
        });

        // 드래그 종료 시, 다음 클릭 1회 억제
        $toolbar.on('dragend', '.draw-tool', function () {
            toolbarDrag.active = false;
            // 마이크로태스크 이후 해제 (같은 사이클의 click 방지)
            setTimeout(function () { toolbarDrag.suppressClick = false; }, 0);
        });

        // 2) 클릭 → 캔버스 클릭 한 번으로 배치 (드래그 후 클릭 억제)
        var drawState = { active: false, type: null };
        function arm(type) { drawState.active = true; drawState.type = type; $canvas.addClass('draw-mode'); }
        function disarm() { drawState.active = false; drawState.type = null; $canvas.removeClass('draw-mode'); }

        $toolbar.on('click', '.draw-tool', function (e) {
            if (toolbarDrag.suppressClick) return; // 드래그 직후 우발 클릭 무시
            arm($(this).data('shape'));
        });

        $canvas.on('mousedown.drawPlace', function (e) {
            if (!drawState.active) return;
            if (e.which !== 1) return;
            if ($canvas.hasClass('canvas-pan-ready') || $canvas.hasClass('canvas-is-panning')) return;

            var target = e.currentTarget;
            var rect = target.getBoundingClientRect();
            var $t = $(target);
            var z = getZoom();

            var cx = e.clientX - rect.left;
            var cy = e.clientY - rect.top;
            var x = (cx + $t.scrollLeft()) / z;
            var y = (cy + $t.scrollTop()) / z;

            var opts = null;
            if (drawState.type === 'text') {
                var t = prompt('텍스트 입력', '');
                if (t == null || t.trim() === '') { // 취소/공백이면 배치 취소
                    disarm();
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                opts = { text: t.trim() };
            }
            addShapeToCanvas(drawState.type, x, y, opts);
            if (window._minimap) window._minimap.draw();

            disarm();
            e.preventDefault();
            e.stopPropagation();
        });

        // ESC로 취소
        $(window).on('keydown.drawEscape', function (e) {
            if (e.key === 'Escape' && drawState.active) disarm();
        });
    }

    // 현재 UI로부터 스타일 상태 읽기
    function getCurrentStyle() {
        var stroke = $('#strokeColor').val() || '#111827';
        var width = parseFloat($('#strokeWidth').val() || '2');
        var dash = $('#dashStyle').val() || '';
        var fill = $('#fillNone').is(':checked') ? 'none' : ($('#fillColor').val() || 'none');
        var capStart = $('#capStart').val() || 'none';
        var capEnd = $('#capEnd').val() || 'none';
        return { stroke, width, dash, fill, capStart, capEnd };
    }

    function ensureMarkers($svg, color) {
        var $defs = $svg.find('defs'); if (!$defs.length) $defs = $('<defs></defs>').appendTo($svg);

        // 화살표
        var $arrow = $svg.find('#mk-arrow');
        if (!$arrow.length) {
            $arrow = $(`
      <marker id="mk-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z"></path>
      </marker>
    `).appendTo($defs);
        }
        $arrow.find('path').attr('fill', color);

        // 점(원)
        var $dot = $svg.find('#mk-dot');
        if (!$dot.length) {
            $dot = $(`
      <marker id="mk-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <circle cx="5" cy="5" r="3"></circle>
      </marker>
    `).appendTo($defs);
        }
        $dot.find('circle').attr('fill', color);
    }

    function applyConnectionStyle($item, style) {
        var $svg = $item.find('svg').first();
        var $pl = $item.find('polyline.connection-polyline').first();
        if (!$svg.length || !$pl.length) return;

        ensureMarkers($svg, style.stroke);

        $pl.attr({
            'stroke': style.stroke,
            'stroke-width': isFinite(style.width) ? style.width : 2,
            'fill': 'none'
        });
        $pl.attr('vector-effect', 'non-scaling-stroke');
        if (style.dash) $pl.attr('stroke-dasharray', style.dash);
        else $pl.removeAttr('stroke-dasharray');

        var map = { none: null, arrow: 'url(#mk-arrow)', dot: 'url(#mk-dot)' };
        if (style.capStart && map[style.capStart]) $pl.attr('marker-start', map[style.capStart]);
        else $pl.removeAttr('marker-start');

        if (style.capEnd && map[style.capEnd]) $pl.attr('marker-end', map[style.capEnd]);
        else $pl.removeAttr('marker-end');
    }


    // 선택된 아이템들에 스타일 적용
    function applyStyleToItem($item, style) {
        if ($item.attr('data-type') === 'connection') {
            applyConnectionStyle($item, style);
            return;
        }

        var $svg = $item.find('svg').first();
        if ($svg.length === 0) return;

        var $root = $svg.find('g.icon-root');
        if ($root.length === 0) return;

        $root.children().each(function () {
            var tag = this.tagName.toLowerCase();

            if (tag === 'text') {
                // 텍스트는 fill=글자색, stroke는 제거
                this.setAttribute('fill', style.stroke);
                this.removeAttribute('stroke');
                this.removeAttribute('stroke-dasharray');
                this.removeAttribute('stroke-width');
                return;
            }

            // 기타 도형(선/면)
            this.setAttribute('stroke', style.stroke);
            this.setAttribute('stroke-width', isFinite(style.width) ? style.width : 2);
            if (style.dash) this.setAttribute('stroke-dasharray', style.dash);
            else this.removeAttribute('stroke-dasharray');

            // 선만 있는 요소(line)는 채우기 없음
            if (tag === 'line') {
                this.setAttribute('fill', 'none');
            } else {
                this.setAttribute('fill', style.fill || 'none');
            }
        });
    }

    // 현재 선택 항목에 즉시 반영
    function applyStyleToSelection() {
        var st = getCurrentStyle();
        $('.canvas-item.is-selected').each(function () { applyStyleToItem($(this), st); });
    }

    function bindStyleBar() {
        // 배경색을 고르면 '없음' 자동 해제 후 즉시 적용
        $('#fillColor').on('input change', function () {
            if ($('#fillNone').is(':checked')) {
                $('#fillNone').prop('checked', false);
            }
            applyStyleToSelection();
        });

        // 없음 체크 변화도 즉시 적용
        $('#fillNone').on('change', function () {
            applyStyleToSelection();
        });

        // 선색/두께/선스타일 변경 시 즉시 적용
        $('#strokeColor, #strokeWidth, #dashStyle')
            .on('input change', function () { applyStyleToSelection(); });

        $('#capStart, #capEnd').on('change', function () { applyStyleToSelection(); });
    }

    $('#canvas').on('dblclick', '.canvas-item', function () {
        var $item = $(this);
        if ($item.attr('data-shape') !== 'text') return;
        var $t = $item.find('g.icon-root > text').first();
        if (!$t.length) return;
        var cur = ($t.text() || '').trim();
        var nx = prompt('텍스트 편집', cur);
        if (nx != null) $t.text(nx.trim());
    });

    function initQuickMenu() {
        var $canvas = $('#canvas');

        // 우클릭(컨텍스트 메뉴)에서만 열기
        $canvas.off('contextmenu.qm').on('contextmenu.qm', '.canvas-item', function (e) {
            e.preventDefault(); // 브라우저 기본 메뉴 막기

            var $it = $(this);
            // 선택 보장
            if (!$it.hasClass('is-selected')) {
                $('.canvas-item.is-selected').removeClass('is-selected')
                    .each(function () { removeSelectionOverlay($(this)); });
                $it.addClass('is-selected');
                applySelectionOverlay($it);
            }

            showQuickMenuAt($it, e.clientX, e.clientY); // 커서 위치에 표시
        });

        // 닫기 조건들 (그대로 유지)
        $canvas.on('mousedown.qm', function (e) {
            if ($(e.target).closest('.canvas-item, #quickMenu').length === 0) hideQuickMenu();
        });
        $canvas.on('scroll.qm', hideQuickMenu);
        $(window).on('keydown.qm', function (e) { if (e.key === 'Escape') hideQuickMenu(); });
        $(window).on('resize.qm', hideQuickMenu);

        // 메뉴 항목 클릭 시(동작은 추후 연결), 일단 닫기만
        $('#quickMenu').off('click.qm').on('click.qm', '.qm-item', function () {
            var cmd = $(this).data('cmd');
            var $anchor = _qm.anchor;
            hideQuickMenu();

            if (cmd === 'link' && $anchor && $anchor.length && $anchor.attr('data-type') !== 'connection') {
                startConnect($anchor);
                return;
            }
            // TODO: settings/copy/paste/delete 등은 추후
        });
    }

    function showQuickMenuAt($item, clientX, clientY) {
        var $m = $('#quickMenu');
        var cont = $('.panel-bottom')[0];
        if (!$m.length || !cont) return;

        _qm.anchor = $item; // 현재 대상 보관

        // 패널 기준 좌표로 변환
        var cr = cont.getBoundingClientRect();
        var x = clientX - cr.left;
        var y = clientY - cr.top;

        // 일단 보이게 한 뒤 크기 확인
        $m.css({ left: x, top: y }).attr('aria-hidden', 'false');

        var mw = $m.outerWidth();
        var mh = $m.outerHeight();
        var cw = cr.width;
        var ch = cr.height;

        // 경계 보정(우/하단 넘침 방지)
        if (x + mw > cw - 8) x = Math.max(8, cw - mw - 8);
        if (y + mh > ch - 8) y = Math.max(8, ch - mh - 8);

        $m.css({ left: x, top: y });
    }


    /** 앱 초기화(명시적 함수명) */
    function appInit() {
        initMenuIcons(10);
        initLayerUI(getDefaultLayers());   // 우측 레이어 UI 초기화

        bindMenuIconDrag();
        bindCanvasDnd();

        bindCanvasItemMove();
        // 이동 옵션 UI에 상단 상수 기본값 반영
        initMoveOptionDefaults();
        bindResizeHandles(); // ← 리사이즈 핸들 활성화
        bindRotateHandle();
        setWorldView(1);
        bindCanvasPan();
        initMinimap();
        bindMinimapToggle();
        bindZoom();
        bindDrawToolbar();
        bindStyleBar();
        initQuickMenu();
        bindConnectMode();
        bindConnectionHandleDrag();
    }
    appInit();
});