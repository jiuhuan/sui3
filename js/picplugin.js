/**
 * @file picPlugin.js
 * @brief 快速调用图片空间插件实现选择/上传图片
 * @author banbian, zangtao.zt@alibaba-inc.com
 * @param opt.triggerEle {string} 触发弹出图片空间插件弹层的元素的css选择器，通常是一些按钮、文字链
 * @param opt.picMinSize {array} 从图片空间选择图片时的尺寸最小值，数组形式[宽，高]，例子： [200, 100]
 * @param opt.picMaxSize {array} 从图片空间选择图片时的尺寸最大值，数组形式[宽，高]，例子： [400, 200]
 * @param opt.cancelCallback {function} 打开图片空间弹层后，点击叉关闭弹层执行的回调（一般不需，针对业务弹层里的上传触发元素时可能会用）
 * @param opt.needCrop {boolean} 是否需要在图片空间插件关闭后弹出图片裁剪弹层
 * @param opt.cropOptions {json}裁剪参数，详见[http://deepliquid.com/content/Jcrop_Manual.html]
 * @param opt.cropInitCallback {function} Jcrop初始化完成后紧跟着会执行的一些逻辑，用于一些特殊目的控制
 * @param opt.beforeSend {function} 用户拖曳鼠标裁剪完后，点击弹层的“确定”按钮后立即执行的回调,第一个参数是即将发送给后端的json数据，包含裁剪信息。该函数若return false，中断后续逻辑（也就不会执行到successCallback），否则会向后端发送裁剪的数据。
 * @param opt.successCallback {function} 主流程完全顺利走完后的回调，第一个参数是图片url
 * @version 1.0.0
 * @date 2015-02-15
 */

//加载图片空间插件js
jQuery.ajax('//g.alicdn.com/sj/pic/1.3.0/static/seller-v2/js/api.js', {dataType: 'script', cache: true})

!function ($) {
  "use strict";

  // 判断域名环境,返回合理的URL
  var getSourceUrl = function(path, hostkey) {
    var isDailyEnv = !/\.com$/.test(location.host), envHost
    if (hostkey) {
      envHost = '//' + hostkey + (isDailyEnv ? '.daily.taobao.net/' : '.taobao.com/')
    } else {
      envHost = isDailyEnv ? '//g-assets.daily.taobao.net/' : '//g.alicdn.com/';
    }
    return envHost + path;
  }

  var pic, $picDlg, pp = {}
  pp._bindEvents = function(triggerEle) {
    var self = this,
      options = this[triggerEle]
    pic.on('heightUpdated', function(h) {
      $picDlg.modal('resize');
    })
    pic.on('picInserted', function(url) {
      //如果对在图片空间选择的图片尺寸有限制：获取图片尺寸校验，再进行后续逻辑
      //如果没有限制：直接执行后续逻辑
      if (options.picMinSize || options.picMaxSize) {
        var tmpImg = new Image()
        tmpImg.onload = function(){
          if (validateSelectedImg(tmpImg.width, tmpImg.height)) {
            doCropOrSuccess()
          } else {
            $.msgTip('亲所选的图片不满足尺寸要求，请重新选择')
          }
        }
        tmpImg.onerror = function(){
            $.msgTip('图片无效，请重新选择')
        }
        tmpImg.src = url
      } else {
        doCropOrSuccess()
      }

      //校验图片宽高，返回值作为是否通过的判断
      function validateSelectedImg(w, h) {
        var minSize = options.picMinSize;
        if (minSize && (w < minSize[0] || h < minSize[1])) {
          return false
        }
        var maxSize = options.picMaxSize;
        if (maxSize && (w > maxSize[0] || h > maxSize[1])) {
          return false
        }
        return true
      }

      //如果不需要裁剪，选完图片后就关闭iframe
      //如果需要裁剪，选完图片后只隐藏picDlg弹层，校验图片尺寸（如有需求），再弹出裁剪框，裁剪流程任意一处都可以返回到选择图片的弹层（即重新显示picDlg）
      function doCropOrSuccess() {
        if (options.needCrop) {
          $picDlg.hide()
          //弹出图片裁剪弹层。
          self._initJcrop(url, triggerEle)
        } else {
          options.successCallback && options.successCallback.call(self, url)
          pic.close();
        }
      }
    })
    pic.on('close', function() {
      $picDlg.modal('okHide');
    })
  }

  pp._initJcrop = function(imgurl, triggerEle) {
    //方法调用返回值
    var options = this[triggerEle],
      self = this,
      jcrop,
      cropdlg
    cropdlg = $.confirm({
      title: '裁剪图片',
      //使用图片空间弹层的遮罩层即可
      backdrop: 'static',
      bgColor: 'rgba(0, 0, 0, 0)',
      keyboard: false,
      body: '<img class="originpic" src="' + imgurl + '"/>',
      show: function() {
        //裁剪组件初始化参数
        var cropOptions = $.extend({
          boxWidth: 400,
          boxHeight: 400
        }, options.cropOptions)
        $(this).find('.originpic').Jcrop(cropOptions, function(){
          jcrop = this
          //执行初始化后的特殊逻辑控制回调
          options.cropInitCallback && options.cropInitCallback.call(self, jcrop)
        })
      },
      okHide: function() {
        var sendData = $.extend({}, jcrop.tellSelect(), {
          picTfs: imgurl[0]
          // @千驹，去掉token校验
          // _tb_token_: $('#J_TB_TOKEN').val()
        })
        if (options.beforeSend) {
          //beforeSend 回调调用方可以在最后return false来阻止后续的请求提交逻辑
          if (options.beforeSend.call(self, sendData) === false) return false;
        }
        //发送裁剪请求
        $.ajax(getSourceUrl('action.do?api=primus_cover_crop', 'we'), {
          type: 'get',
          data: sendData,
          dataType: 'jsonp'
        }).done(function(res) {
          if (res.success) {
            //手工调用的okHide不会再进okHide回调
            cropdlg.modal('okHide')
            options.successCallback && options.successCallback.call(self, getSourceUrl('tfscom/' + res.data.tfsFilePath, 'img01'))
            //把之前隐藏的图片空间iframe和弹层关闭
            pic.close()
          } else {
            $.msgTip(res.msg)
          }
        })
        //阻止默认关闭弹层逻辑
        return false
      },
      cancelHide: function() {
        $picDlg.show()
      },
      hidden: function() {
        jcrop.destroy()
      }
    })
  }

  pp.init = function(opt) {
    this[opt.triggerEle] = $.extend({
      //默认配置
      needCrop: true
    }, opt)

    //如果需要裁剪，且Jcrop尚未被加载进来，load it
    if (this[opt.triggerEle].needCrop && !$.fn.Jcrop) {
      $("head").append("<link rel='stylesheet' type='text/css' href='//g.alicdn.com/sj/lib/jcrop/css/jquery.Jcrop.min.css' />")

      $.ajax('//g.alicdn.com/sj/lib/jcrop/js/jquery.Jcrop.min.js', {dataType: 'script', cache: true})
      .done(function(){
        bindTriggerClick()
      })
    } else {
      bindTriggerClick()
    }

    function bindTriggerClick() {
      $(opt.triggerEle).off('click.pp').on('click.pp', function(e){
        e.preventDefault()
        $picDlg = $.alert({
          title: '选择图片',
          body: '<div id="picPluginWrap"></div>',
          hasfoot: false,
          width: 'large',
          shown: function(){
            pic = __picPlugin__.init({
              containerId: 'picPluginWrap',
              singleSelect: true
            })
            pp._bindEvents(opt.triggerEle)
            pic.run()
          },
          hide: function() {
            opt.cancelCallback && opt.cancelCallback.call(null, opt.triggerEle)
          },
          cancelHidden: function() {
            pic && pic.close();
          }
        })
      })
    }
  }

}(jQuery)
