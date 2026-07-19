package com.gotion.base.config.i18n;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.ObjectUtil;
import com.alibaba.nacos.api.NacosFactory;
import com.alibaba.nacos.api.PropertyKeyConst;
import com.alibaba.nacos.api.config.ConfigService;
import com.alibaba.nacos.api.config.listener.Listener;
import com.gotion.common.constants.CommonConstants;
import com.gotion.common.constants.I18nConstant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.charset.Charset;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.Executor;

/***
 *                    _ooOoo_
 *                   o8888888o
 *                   88" . "88
 *                   (| -_- |)
 *                    O\ = /O
 *                ____/`---'\____
 *              .   ' \\| |// `.
 *               / \\||| : |||// \
 *             / _||||| -:- |||||- \
 *               | | \\\ - /// | |
 *             | \_| ''\---/'' | |
 *              \ .-\__ `-` ___/-. /
 *           ___`. .' /--.--\ `. . __
 *        ."" '< `.___\_<|>_/___.' >'"".
 *       | | : `- \`.;`\ _ /`;.`/ - ` : | |
 *         \ \ `-. \_ __\ /__ _/ .-` / /
 * ======`-.____`-.___\_____/___.-`____.-'======
 *                    `=---='
 *
 * .............................................
 * 佛祖保佑                               永无BUG
 * @author zhouliming
 * @package com.gotion.base.config
 * @date 2024/8/8 2:34 下午
 */
@Slf4j
@Component
public class I18NConfig {

    /**
     * 服务器地址
     */
    private String serverAddr;

    private String username;

    private String password;

    @Autowired
    private ConfigurableApplicationContext applicationContext;

    @Autowired
    public void init() {
        serverAddr = applicationContext.getEnvironment().getProperty("spring.cloud.nacos.config.server-addr");
        username = applicationContext.getEnvironment().getProperty("spring.cloud.nacos.config.username");
        password = applicationContext.getEnvironment().getProperty("spring.cloud.nacos.config.password");
        initTip(null);
        initTip(Locale.CHINA);
        initTip(Locale.US);
    }

    /**
     *
     * @param locale
     */
    private void initTip(Locale locale) {
        String content = null;
        String dataId = null;
        ConfigService configService = null;
        try {
            if (locale == null) {
                dataId = I18nConstant.BASE_NAME + ".properties";
            } else {
                dataId = I18nConstant.BASE_NAME + "_" + locale.getLanguage() + "_" + locale.getCountry() + ".properties";
            }
            Properties properties = new Properties();
            properties.put(PropertyKeyConst.SERVER_ADDR, serverAddr);
            properties.put(PropertyKeyConst.NAMESPACE, I18nConstant.GROUP);
            properties.put(PropertyKeyConst.USERNAME, username);
            properties.put(PropertyKeyConst.PASSWORD, password);
            configService = NacosFactory.createConfigService(properties);
            content = configService.getConfig(dataId, I18nConstant.GROUP, 5000);
            if (ObjectUtil.isEmpty(content)) {
                return;
            }
            saveAsFileWriter(dataId, content);
            setListener(configService, dataId, locale);
        } catch (Exception e) {
            log.error("init i18n:{}", e);
        }
    }

    private void setListener(ConfigService configService, String dataId, Locale locale) throws com.alibaba.nacos.api.exception.NacosException {
        configService.addListener(dataId, I18nConstant.GROUP, new Listener() {
            @Override
            public void receiveConfigInfo(String configInfo) {
                log.info("receiveConfigInfo:{}", configInfo);
                try {
                    initTip(locale);
                } catch (Exception e) {
                    log.error("receiveConfigInfo error:{}", e);
                }
            }

            @Override
            public Executor getExecutor() {
                return null;
            }
        });
    }

    private void saveAsFileWriter(String fileName, String content) {
        String path = System.getProperty("user.dir") + CommonConstants.SLASH + I18nConstant.FILE_NAME;
        try {
            fileName = path + File.separator + fileName;
            File file = new File(fileName);
            FileUtil.writeString(content,file, Charset.defaultCharset());
            log.info("receiveConfigInfo update:{}", fileName);
        } catch (Exception e) {
            log.error("receiveConfigInfo path:{} error:{}", fileName, e);
        }
    }

}
